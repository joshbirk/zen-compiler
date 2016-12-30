#!/usr/bin/env node
var fs = require('fs');
var notifier = require('node-notifier');
var jsforce = require('jsforce');
var prompt = require('prompt');
var colors = require("colors/safe");

var names_to_ids = [];
var names_to_metaids = [];
var metaids_to_names = [];
var names_to_auradefid = [];
var containerId = null;
var check_for_errors = false;
var sr = null;
var compile_in_progress = false;
var pending_compiles = [];
var pending_names = [];

var wait_phrases1 = ["Brooks are babbling","Leaves are rustling","A cool breeze blows","Somewhere there is a rainbow","It is likely a puppy got adopted today","Somewhere, the skies are blue","Today is not a good day to die"];
var wait_phrases2 = ["A mountain sighs","Changing the polarity","The tree that bends survives the storm","Take a deep breath","Every morning, a fresh dew on the leaf","Pixels can make true art","Mistakes are part of learning","Errors do not define you"];
var wait_phrases3 = ["Take a moment, this API is...","Taking the next star to the right","A river flows into the ocean","Could use a sonic screwdriver","The sun will always shine again","We left footprints on the moon","Tomorrow is the first day of the rest of your life","Shy from danger, not the fight","To err is human"];

var all_phrases = [];

if(process.argv[0].indexOf("node") >= 0) {
  if(process.argv.length > 2) {
    all_phrases = fs.readFileSync(process.argv[2]).toString().split("\n");
  }
}

if (process.argv[0].indexOf("zenc") >= 0) {
  if(process.argv.length > 1) {
    all_phrases = fs.readFileSync(process.argv[1]).toString().split("\n");
  }
}

if(all_phrases.length == 0) {

  for(var x = 0; x < wait_phrases1.length; x++) {
    all_phrases.push(wait_phrases1[x]);
  }
  for(var x = 0; x < wait_phrases2.length; x++) {
    all_phrases.push(wait_phrases2[x]);
  }
  for(var x = 0; x < wait_phrases3.length; x++) {
    all_phrases.push(wait_phrases3[x]);
  }

}
console.log(colors.blue(getWaitPhrase()));

prompt.message = colors.rainbow("zenc ");
prompt.delimiter = colors.reset("");

var previous = null;
if (fs.existsSync('.zen')){
    cookie = fs.readFileSync('.zen');
    previous = JSON.parse(cookie);
}

var options = {
  showNotify: true,
  showOnSuccess: true,
  dir_delimiter: '/',
  API: 38.0,
  env: 'https://test.salesforce.com'
}

var prompt_schema = null;
if(!previous) {
    prompt_schema = {
        properties: {
          username: {
            description: 'Salesforce Username:',
            required: true
          },
          password: {
            description: 'Salesforce Password:',
            required: true,
            replace: '~',
            hidden: true
          },
          environment: {
            description: 'Environment [login|test] (default: login)',
            type: 'string',
            pattern: 'login|test',
            message: 'Must be login or test',
            defaut:'login'
          }
        }
      }
} else {
  prompt_schema = {
      properties: {
        username: {
          description: 'Salesforce Username ('+previous.username+'):'
        },
        password: {
          description: 'Salesforce Password:',
          required: true,
          replace: '~',
          hidden: true
        },
        environment: {
          description: 'Environment [login|test] ('+previous.environment+'):',
          type: 'string',
          pattern: 'login|test',
          message: 'Must be login or test',
          defaut:'login'
        }
      }
    }
}


var conn = null;
prompt.start();
prompt.get(prompt_schema, function (err, result) {
    if(result.username == '' && previous) { result.username = previous.username; }
    if(result.environment == '' && previous) { result.environment = previous.environment; }
    if(result.environment == '' && !previous) { result.environment = 'login'; }

    loginAndRun(result.username,result.password,result.environment);
    fs.writeFile(".zen", '{"username":"'+result.username+'","environment":"'+result.environment+'"}', function(err) {
          if(err) {
              return console.log(err);
          }});
  });

function loginAndRun(username,password,env) {
        conn = new jsforce.Connection({loginUrl : 'https://'+env+'.salesforce.com'});
        conn.login(username, password, function(err, userInfo) {

        if (err) {  console.log(err);  }
        else {
        	console.log('Logged into Salesforce.');

        	console.log('Checking Container, please wait...');
          createContainer();

        	fs.watch('.', {recursive: true}, function(eventType, filename) {

            if (filename && checkFileType(filename) != null) {
        			var filetype = checkFileType(filename);
        			var tooltype = checkToolType(filename);
        			var fullname = checkFullName(filename);
              var filebody = null
              if (fs.existsSync(filename) && fs.statSync(filename)["size"] > 0){
                  filebody = fs.readFileSync(filename).toString();
              }
              if(filebody != null && filebody != "") {
                console.log(fullname+' change detected ('+eventType+'). File is a '+filetype);
                notifyMessage(fullname,'Compiling '+tooltype,'Sending '+fullname+' to the Tooling API');
              }

              if(tooltype == "AuraDefinition" && filebody != null && filebody != "") {
                var number_of_dir = filename.split(options.dir_delimiter).length;
                if(number_of_dir > 1) {
                  var AuraDefinitionBundle = filename.split(options.dir_delimiter)[number_of_dir-2];
                  if(names_to_auradefid[AuraDefinitionBundle] != null) {
                      upsertAuraDefinition(names_to_auradefid[AuraDefinitionBundle],filetype,filebody);
                  } else {
                      conn.tooling.query("SELECT ID from AuraDefinitionBundle where DeveloperName = '"+AuraDefinitionBundle+"'",function(err,res){
                        if(res.totalSize > 0) {
                          upsertAuraDefinition(res.records[0].Id,filetype,filebody);
                        } else {
                          conn.tooling.sobject("AuraDefinitionBundle").create({
                            DeveloperName: AuraDefinitionBundle,
                            MasterLabel: AuraDefinitionBundle,
                            Description: AuraDefinitionBundle,
                            ApiVersion: options.API,
                          },function(err,res){
                            if(err){console.log(err);}
                            else{upsertAuraDefinition(res.id,filetype,filebody);}
                          })
                        }
                      })
                    }
                } else {
                  console.log('No parent directory for AuraDefinition '+fullname);
                  notifyMessage(fullname,'Failed to compile '+fullname,'No parent directory found for AuraDefinitionBundle');
                }
              }

              if(tooltype != "AuraDefinition" && names_to_ids[fullname] && names_to_metaids[fullname] && filebody != null && filebody != "") {
        				updateMembersAndSendRequest(fullname,tooltype,filebody);
        			} else if(tooltype != "AuraDefinition" && filebody != null) {
        				console.log('MetaData not found for '+fullname+' ('+tooltype+'), creating...');
        				queryOrCreateMember(fullname,tooltype,filebody);
        			}


        		}
        	});

        }
        });
}


function queryOrCreateMember(fullname,tooltype,filebody) {
  conn.query("SELECT ID FROM "+tooltype+" WHERE NAME = '"+fullname+"'", function(err, res) {
    if(!err && res.records.length > 0) {
      names_to_ids[fullname] = res.records[0].Id;
      conn.tooling.sobject(tooltype+"Member").create({
              ContentEntityId: names_to_ids[fullname],
              MetadataContainerId: containerId,
              body: filebody
            }, function(err, res) {
              if (err) { console.log(err);  }
              else {
                names_to_metaids[fullname] = res.id;
                metaids_to_names[res.id] = fullname;
                updateMembersAndSendRequest(fullname,tooltype,filebody);
              }
            });
    } else if(err) { console.log(err);  }
      else if(res.totalSize == 0) { console.log(fullname+' ('+tooltype+') not found.  Creating.');
      console.log(filebody);
      conn.sobject(tooltype).create({
              Name: fullname,
              body: filebody
            }, function(err, res) {
              if (err) { console.log(err);  }
              else {
                names_to_ids[fullname] = res.id;
                conn.tooling.sobject(tooltype+"Member").create({
                        ContentEntityId: names_to_ids[fullname],
                        MetadataContainerId: containerId,
                        body: filebody
                      }, function(err, res) {
                        if (err) { console.log(err);  }
                        else {
                          names_to_metaids[fullname] = res.id;
                          metaids_to_names[res.id] = fullname;
                          updateMembersAndSendRequest(fullname,tooltype,filebody);
                        }
                      });
              }
            });
    }
  });
}


function createContainer() {
  	conn.tooling.query("SELECT ID FROM MetadataContainer WHERE NAME = 'CLI Compiler'", function(err, res) {
  		if(err) { console.log(err);  }
  		if(res.records.length > 0) {
  			containerId = res.records[0].Id;
  			checkExistingClassMembers();
  			checkExistingTriggerMembers();
        checkExistingPageMembers();
        console.log('Container found.');
  		} else {
  			conn.tooling.sobject("MetaDataContainer").create({Name:"CLI Compiler"}, function(err, res) {
  							if (err) { console.log(err);  }
  							else {
  								containerId = res.Id;
                  checkExistingClassMembers();
  								checkExistingTriggerMembers();
                  checkExistingPageMembers();
                  console.log('Container created.');
  							}
  						});
  		}
  	});
}

function checkExistingClassMembers() {
	conn.tooling.query("SELECT ID, ContentEntityId, FullName FROM ApexClassMember WHERE MetadataContainerId = '"+containerId+"'", function(err, res) {
		if(err) { console.log(err);  }
		console.log(res.records.length + " Apex Class(es) found in Container.");
		for(var x = 0; x < res.records.length; x++) {
			names_to_ids[res.records[x].FullName] = res.records[x].ContentEntityId;
			names_to_metaids[res.records[x].FullName] = res.records[x].Id;
			metaids_to_names[res.records[x].Id] = res.records[x].FullName;
		}

	});
}

function checkExistingTriggerMembers() {
	conn.tooling.query("SELECT ID, ContentEntityId, FullName FROM ApexTriggerMember WHERE MetadataContainerId = '"+containerId+"'", function(err, res) {
		if(err) { console.log(err);  }
		console.log(res.records.length + " Apex Trigger(s) found in Container.");
		for(var x = 0; x < res.records.length; x++) {
      names_to_ids[res.records[x].FullName] = res.records[x].ContentEntityId;
			names_to_metaids[res.records[x].FullName] = res.records[x].Id;
			metaids_to_names[res.records[x].Id] = res.records[x].FullName;
		}

	});
}

function checkExistingPageMembers() {
	conn.tooling.query("SELECT ID, ContentEntityId, FullName FROM ApexPageMember WHERE MetadataContainerId = '"+containerId+"'", function(err, res) {
		if(err) { console.log(err);  }
		console.log(res.records.length + " Apex Pages(s) found in Container.");
		for(var x = 0; x < res.records.length; x++) {
      names_to_ids[res.records[x].FullName] = res.records[x].ContentEntityId;
			names_to_metaids[res.records[x].FullName] = res.records[x].Id;
			metaids_to_names[res.records[x].Id] = res.records[x].FullName;
		}

	});

  conn.tooling.query("SELECT ID, ContentEntityId, FullName FROM ApexComponentMember WHERE MetadataContainerId = '"+containerId+"'", function(err, res) {
		if(err) { console.log(err);  }
		console.log(res.records.length + " Apex Components(s) found in Container.");
		for(var x = 0; x < res.records.length; x++) {
      names_to_ids[res.records[x].FullName] = res.records[x].ContentEntityId;
			names_to_metaids[res.records[x].FullName] = res.records[x].Id;
			metaids_to_names[res.records[x].Id] = res.records[x].FullName;
		}

	});
}

function upsertAuraDefinition(AuraDefinitionBundleId,filetype,body) {
  var DefType = filetype.split(" ")[1].toUpperCase();
  var Format = "XML";
  if(DefType == "CONTROLLER" || DefType == "HELPER" || DefType == "RENDERER") {Format = "JS"; }
  if(DefType == "STYLE") {Format = "CSS"; }
  console.log('upserting '+DefType+'('+Format+') into '+AuraDefinitionBundleId);
  conn.tooling.query("SELECT ID FROM AuraDefinition where DefType = '"+DefType+"' and AuraDefinitionBundleId = '"+AuraDefinitionBundleId+"'",
  function(err,res){
    if(res.totalSize > 0) {
      conn.tooling.sobject("AuraDefinition").update({
          Id: res.records[0].Id,
          Source: body
        }, function(err,res) {
            console.log(res);
            if (err) { console.log(err); notifyMessage("Error",'Aura Definition Update Failed',err.ErrorMsg); }
            if (!err) { console.log('Aura Definition Updated'); notifyMessage("Success",'Aura Definition Updated',DefType+'('+Format+') succesfully updated.'); }
        });
    } else {
      conn.tooling.sobject("AuraDefinition").create({
          AuraDefinitionBundleId: AuraDefinitionBundleId,
          DefType: DefType,
          Format: Format,
          Source: body
        }, function(err,res) {
            console.log(res);
            if (err) { console.log(err); notifyMessage("Error",'Aura Definition Create Failed',err.ErrorMsg); }
            if (!err) { console.log('Aura Definition Updated'); notifyMessage("Success",'Aura Definition Created',DefType+'('+Format+') succesfully created.'); }
        });
    }
  });

}

function updateMembersAndSendRequest(fullname,tooltype,filebody) {
  if(!compile_in_progress) {
      clearTimeout(sr);
      conn.tooling.sobject(tooltype+"Member").update({
    					Id: names_to_metaids[fullname],
    					body: filebody
    				}, function(err, res) {
              if(err) { console.log(err); }
      				if (err) { notifyMessage(fullname,'Request Pending','Container is busy.  Cannot send recent change.');  }
              else { notifyWaitPhrase(fullname); }
              sr = setTimeout(actuallySendRequest(fullname),500);
    				});
  } else {

    pending_compiles[fullname] = {fullname:fullname,tooltype:tooltype,filebody:filebody};
    pending_names.push(fullname);
    console.log(pending_names.length);

  }
}

function actuallySendRequest(fullname) {
  if(!compile_in_progress) {
    compile_in_progress = true;
    conn.tooling.sobject('containerAsyncRequest').create({
      MetadataContainerId: containerId,
      isCheckOnly: false
    }, function(err, res){
        notifyWaitPhrase(fullname);
        if(err) { console.log(err); }
				if (err) { notifyMessage(fullname,'Request Pending','Container is busy.  Cannot send recent change.');  }
        if (!err) { checkStatus(res.id,fullname); }
    });
  }
}

function checkFileType(filename) {
  if(filename.indexOf('.') > 0) {
    if(filename.split('.')[1].toLowerCase() == "cls") { return "Apex Class"; }
  	else if(filename.split('.')[1].toLowerCase() == "trigger") { return "Apex Trigger"; }
  	else if(filename.split('.')[1].toLowerCase() == "page") { return "Visualforce Page"; }
    else if(filename.split('.')[1].toLowerCase() == "vfc") { return "Visualforce Component"; }
    else if(filename.split('.')[1].toLowerCase() == "component") { return "Visualforce Component"; }
    else if(filename.split('.')[1].toLowerCase() == "cmp") { return "Aura Component"; }
    else if(filename.split('.')[1].toLowerCase() == "js") {
      if(filename.indexOf('Controller.js') > 0) { return "Aura Controller"; }
      if(filename.indexOf('Helper.js') > 0) { return "Aura Helper"; }
      if(filename.indexOf('Renderer.js') > 0) { return "Aura Renderer"; }
    }
    else if(filename.split('.')[1].toLowerCase() == "css") { return "Aura Style"; }
    else if(filename.split('.')[1].toLowerCase() == "auradoc") { return "Aura Documentation"; }
    else if(filename.split('.')[1].toLowerCase() == "design") { return "Aura Design"; }
    else if(filename.split('.')[1].toLowerCase() == "svg") { return "Aura SVG"; }

    else {return null;}
  } else {return null;}
}

function checkToolType(filename) {
  if(filename.indexOf('.') > 0) {
    if(filename.split('.')[1].toLowerCase() == "cls") { return "ApexClass"; }
  	else if(filename.split('.')[1].toLowerCase() == "trigger") { return "ApexTrigger"; }
  	else if(filename.split('.')[1].toLowerCase() == "page") { return "ApexPage"; }
    else if(filename.split('.')[1].toLowerCase() == "vfc") { return "ApexComponent"; }
    else if(filename.split('.')[1].toLowerCase() == "component") { return "ApexComponent"; }
    else if(filename.split('.')[1].toLowerCase() == "cmp" ||
            filename.split('.')[1].toLowerCase() == "js" ||
            filename.split('.')[1].toLowerCase() == "css" ||
            filename.split('.')[1].toLowerCase() == "auradoc" ||
            filename.split('.')[1].toLowerCase() == "design" ||
            filename.split('.')[1].toLowerCase() == "svg") { return "AuraDefinition"; }

    else {return null;}
  } else {return null;}
}

function checkFullName(filename) {
	var file_w_dir = filename.split('/');
	var real_filename = file_w_dir[file_w_dir.length-1].split('.')[0];
	return real_filename;
}

function checkStatus(requestId,fullname) {
  conn.tooling.query("SELECT Id, ErrorMsg, State, DeployDetails FROM ContainerAsyncRequest Where Id = '"+requestId+"'", function(err, res) {
				if(err) { console.log(err); }
				if(res.records.length > 0) {
					if(res.records[0].State == 'Queued') { setTimeout(function() {checkStatus(requestId,fullname); notifyWaitPhrase(fullname);},300); }
					if(res.records[0].State == 'Failed') { notifyStatus(res.records[0]); compile_in_progress = false; }
					if(res.records[0].State == 'Completed') {
            notifyStatus(res.records[0]);
            names_to_metaids[res.records[0].DeployDetails.allComponentMessages[0].fullName] = null;
            compile_in_progress = false;
          }
					if(res.records[0].State == 'Error') { console.log(res.records[0].ErrorMsg); compile_in_progress = false; }
				} else {
          console.log('No Sync Request Found');
        }
        if(!compile_in_progress) {
          for(var x = 0; x < pending_names.length; x++) {
            if(pending_names[x] != null) {
              console.log(colors.blue('Sending pending '+pending_names[x]+' to compile'));
              queryOrCreateMember(pending_compiles[pending_names[x]].fullname,pending_compiles[pending_names[x]].tooltype,pending_compiles[pending_names[x]].filebody);
              pending_names[x] = null;
            }
          }
        }
      });
}

function notifyMessage(title,subtitle,message) {
  if(!options.showNotify) {return;}
  notifier.notify({
    'title': title,
    'subtitle': subtitle,
    'message': message
  })
}

function notifyStatus(asyncResponse) {
  if(!options.showNotify) {return;}
  var message = asyncResponse.DeployDetails.allComponentMessages[0];

  if(asyncResponse.State == 'Queued') {
    notifier.notify({
      'title': message.fullName,
      'subtitle': 'Compiling...',
      'message': getWaitPhrase()
    });
  }

  if(asyncResponse.State == 'Completed' && options.showOnSuccess) {
    console.log(colors.green(message.fullName+' compiled successfully'));
    notifier.notify({
      'title': message.fullName,
      'subtitle': 'Compile Successful',
      'message': message.fullName + ' compiled successfully.'
    });
  }

  if(asyncResponse.State == 'Failed') {
    console.log(colors.red(message.problem +' at line '+message.lineNumber+', column '+message.columnNumber));
    notifier.notify({
      'title': message.fullName,
      'subtitle': 'Error:' + message.problem,
      'message': 'Line:'+message.lineNumber+' Column:'+message.columnNumber
    });

  }
}

function getWaitPhrase() {
  return all_phrases[Math.floor(Math.random()*all_phrases.length)];
}

function notifyWaitPhrase(fullname) {
  if(!options.showNotify) {return;}
  notifier.notify({
      'title': fullname,
      'subtitle': 'Waiting...',
      'message': getWaitPhrase()
    });
}
