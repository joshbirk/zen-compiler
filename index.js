var fs = require('fs');
var notifier = require('node-notifier');
var jsforce = require('jsforce');
var prompt = require('prompt');
var colors = require("colors/safe");
var commandLineArgs = require('command-line-args')

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

var wait_phrases1 = ["Brooks are babbling","Blaze your own trail","Leaves are rustling","A cool breeze blows","Somewhere there is a rainbow","It is likely a puppy got adopted today","Somewhere, the skies are blue","Today is not a good day to die"];
var wait_phrases2 = ["Live the life you have imagined.","A mountain sighs","Changing the polarity","The tree that bends survives the storm","Take a deep breath","Every morning, a fresh dew on the leaf","Pixels can make true art","Mistakes are part of learning","Errors do not define you"];
var wait_phrases3 = ["Go confidently in the direction of your dreams.","Take a moment, this API is...","Taking the next star to the right","A river flows into the ocean","Could use a sonic screwdriver","The sun will always shine again","We left footprints on the moon","Tomorrow is the first day of the rest of your life","Shy from danger, not the fight","To err is human"];

var all_phrases = [];
for(var x = 0; x < wait_phrases1.length; x++) {
  all_phrases.push(wait_phrases1[x]);
}
for(var x = 0; x < wait_phrases2.length; x++) {
  all_phrases.push(wait_phrases2[x]);
}
for(var x = 0; x < wait_phrases3.length; x++) {
  all_phrases.push(wait_phrases3[x]);
}

var options = {
  showNotify: true,
  showOnSuccess: true,
  dir_delimiter: '/',
  API: 43.0,
  env: 'https://test.salesforce.com'
}

function loginAndRunWithToken(instance,token) {
    conn = new jsforce.Connection({instanceUrl: instance, accessToken : token});
    console.log(colors.blue(getWaitPhrase()));
    console.log(colors.green('Logged into Salesforce instance '+conn.instanceUrl+' with the access token '+conn.accessToken));
    createContainerAndWatch();
}

function loginAndRun(username,password,env) {
          conn = new jsforce.Connection({loginUrl : 'https://'+env+'.salesforce.com'});
          conn.login(username, password, function(err, userInfo) {
            if (err) {  console.log(err);  }
            else {
              console.log(colors.green('Logged into Salesforce instance '+conn.instanceUrl+' with the access token '+conn.accessToken));
              createContainerAndWatch();
            }
          });
}

function setToken(instance,token) {
  console.log(colors.green('Setting Salesforce instance '+instance+' with the access token '+token+' to .zen'));
  fs.writeFile(".zen", '{"instanceUrl":"'+instance+'","accessToken":"'+token+'"}', function(err) {
      if(err) {
          return console.log(err);
      } else {
          return console.log("Token set.  Use zenc to watch for files.")
      }
    });
}

function createContainerAndWatch() {
        	console.log('Checking Container, please wait...');
          createContainer();
          console.log('Watching for updates.  Press Ctrl+C to quit.');
          fs.watch('.', {recursive: true}, function(eventType, filename) {
            console.log(checkFileType(filename));
            if (filename && checkFileType(filename) != null) {

              var filetype = checkFileType(filename);
        			var tooltype = checkToolType(filename);
        			var fullname = checkFullName(filename);
              var filebody = null;

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
        				if(sr == null) {
                  sr = setTimeout(function() {updateMembersAndSendRequest(fullname,tooltype,filebody)},100);
                } else {
                  clearTimeout(sr);
                  sr = setTimeout(function() {updateMembersAndSendRequest(fullname,tooltype,filebody)},100);
                }
        			} else if(tooltype != "AuraDefinition" && filebody != null) {
        				console.log('MetaData not found for '+fullname+' ('+tooltype+'), creating...');
        				if(sr == null) {
                  sr = setTimeout(function() {queryOrCreateMember(fullname,tooltype,filebody)},1000);
                } else {
                  clearTimeout(sr);
                  sr = setTimeout(function() {queryOrCreateMember(fullname,tooltype,filebody)},1000);
                }
        			}


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
              Body: filebody
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
      var payload = {};
      if(tooltype == 'ApexClass' || tooltype == 'ApexTrigger') {
        payload = {
                Name: fullname,
                Body: filebody
              }
      } else {
        payload = {
                Name: fullname,
                Markup: filebody,
                MasterLabel: fullname
              }
      }

      console.log("PAYLOAD"+payload);
      conn.sobject(tooltype).create(payload, function(err, res) {
              if (err) { console.log(err);  }
              else {
                names_to_ids[fullname] = res.id;
                conn.tooling.sobject(tooltype+"Member").create({
                        ContentEntityId: names_to_ids[fullname],
                        MetadataContainerId: containerId,
                        Body: filebody
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
        console.log('Container found, deleting.');
  		/*	containerId = res.records[0].Id;
  			checkExistingClassMembers();
  			checkExistingTriggerMembers();
        checkExistingPageMembers();
        console.log('Container found.'); */
        conn.tooling.sobject("MetaDataContainer").delete([res.records[0].Id], function(err,res){
          console.log(res);
          conn.tooling.sobject("MetaDataContainer").create({Name:"CLI Compiler"}, function(err, res) {
            if (err) { console.log(err);  }
            else {
              console.log(res);
              containerId = res.id;
              console.log('Container created. '+containerId);
            }
          });  
        })
  		} else {
  			conn.tooling.sobject("MetaDataContainer").create({Name:"CLI Compiler"}, function(err, res) {
  							if (err) { console.log(err);  }
  							else {
  								containerId = res.Id;
                  console.log('Container created.'+containerId);
  							}
  						});
  		}
  	});
}

/*
function checkExistingClassMembers() {
  if(containerId) {
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
}

function checkExistingTriggerMembers() {
  if(containerId) {
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
}

function checkExistingPageMembers() {
  if(containerId) {
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
}
*/

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
            if (err) { console.log(colors.red(err)); notifyMessage("Error",'Aura Definition Update Failed',err.errorCode); }
            if (!err) { console.log(colors.green('Aura '+DefType+' Updated')); notifyMessage("Success",'Aura Definition Updated',DefType+'('+Format+') succesfully updated.'); }
        });
    } else {
      conn.tooling.sobject("AuraDefinition").create({
          AuraDefinitionBundleId: AuraDefinitionBundleId,
          DefType: DefType,
          Format: Format,
          Source: body
        }, function(err,res) {
            if (err) { console.log(colors.red(err)); notifyMessage("Error",'Aura Definition Create Failed',err.errorCode); }
            if (!err) { console.log(colors.green('Aura '+DefType+' Updated')); notifyMessage("Success",'Aura Definition Created',DefType+'('+Format+') succesfully created.'); }
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
              if (err) { console.log(err); }
      				if (err) { notifyMessage(fullname,'Request Pending','Container is busy.  Cannot send recent change.');  }
              else { notifyWaitPhrase(fullname); }
              sr = setTimeout(function() {actuallySendRequest(fullname)},500);
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
    else if(filename.split('.')[1].toLowerCase() == "app") { return "Aura Application"; }
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
            filename.split('.')[1].toLowerCase() == "app" ||
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
					if(res.records[0].State == 'Queued') { setTimeout(function() {checkStatus(requestId,fullname); notifyWaitPhrase(fullname);},600); }
					if(res.records[0].State == 'Failed') { console.log(colors.red(res.records[0])); notifyStatus(res.records[0]); compile_in_progress = false; }
					if(res.records[0].State == 'Completed') {
            notifyStatus(res.records[0]);
            names_to_metaids[res.records[0].DeployDetails.allComponentMessages[0].fullName] = null;
            compile_in_progress = false;
          }
					if(res.records[0].State == 'Error') { console.log(colors.red(res.records[0].ErrorMsg)); compile_in_progress = false; }
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




module.exports = {

  loginAndRun: (username, password, environment) => {
    loginAndRun(username, password, environment);
  },

  setToken: (instanceUrl, token) => {
    setToken(instanceUrl,token);
  },

  loginAndRunWithToken: (instanceUrl, token) => {
    loginAndRunWithToken(instanceUrl,token);
  },

  getWaitPhrase: () => {
    return getWaitPhrase();
  }
};
