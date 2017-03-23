#!/usr/bin/env node
var fs = require('fs');
var notifier = require('node-notifier');
var jsforce = require('jsforce');
var prompt = require('prompt');
var colors = require("colors/safe");
var dust = require('dustjs-helpers');
dust.optimizers.format = function(ctx, node) { return node };

var async = require('async');

var options = {
  showNotify: true,
  showOnSuccess: true,
  dir_delimiter: '/',
  API: 39.0,
  env: 'https://test.salesforce.com'
}

var previous = null;
if (fs.existsSync('.zen')){
    cookie = fs.readFileSync('.zen');
    previous = JSON.parse(cookie);
}

prompt.message = colors.rainbow("zenla ");
prompt.delimiter = colors.reset("");

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
            description: 'Environment [login|test] (default: login):',
            type: 'string',
            pattern: 'login|test',
            message: 'Must be login or test',
            defaut:'login'
          },search: {
            message: 'Apex Class Name:',
            required: true
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
        },
        search: {
          message: 'Apex Class Name:',
          required: true
        }
      }
      }
}

var conn = null;
var returns = 0;
var bundle_to_id = [];

prompt.start();
prompt.get(prompt_schema, function (err, result) {
    if(result.username == '' && previous) { result.username = previous.username; }
    if(result.environment == '' && previous) { result.environment = previous.environment; }
    if(result.environment == '' && !previous) { result.environment = 'login'; }

    loginAndRun(result.username,result.password,result.environment,result.search);
  });

function loginAndRun(username,password,env,search) {
  conn = new jsforce.Connection({loginUrl : 'https://'+env+'.salesforce.com'});
  conn.login(username, password, function(err, userInfo) {

  if (err) {  console.log(err);  }
  else {
    console.log('Logged into Salesforce.');

    conn.query("SELECT Name, Body from ApexClass where Name = '"+search+"'",function(err,result){

      if(result.totalSize == 1) {

            var apexJSON = {};
            apexJSON.functions = [];
            apexJSON.name = search;

            var apexBody = result.records[0].Body;
            var apexBodyArray = apexBody.split('\n');
            var functionLines = [];
            var commentLines = [];

            for(var i = 0; i < apexBodyArray.length; i++) {
              if(apexBodyArray[i].toLowerCase().indexOf('@auraenabled') >= 0) {
                 if(apexBodyArray[i].indexOf("//") > 0) {
                    functionLines.push(apexBodyArray[i+1]);
                    commentLines.push(apexBodyArray[i].split("//")[1].trim());
                 } else {
                    functionLines.push(apexBodyArray[i+1]);
                    commentLines.push("none");
                 }

              }
            }

            for(var i = 0; i < functionLines.length; i++) {
              var apexAuraFunc = {};
              var functionLine = functionLines[i];

              functionLine = functionLine.trim();

              var functionDescVParams = functionLine.split("(");
              apexAuraFunc.name = functionDescVParams[0].split(" ")[3];
              apexAuraFunc.returnType = functionDescVParams[0].split(" ")[2];
              apexAuraFunc.comment = commentLines[i];

              var functionParams = functionDescVParams[1].replace("{","").trim().replace(")","").trim();


              if(functionParams.indexOf(",") >= 0) {
                var functionParts = functionParams.split(",");

                apexAuraFunc.params = [];

                for(var i = 0; i < functionParts.length; i++) {
                  var params = functionParts[i].trim().split(" ");
                  apexAuraFunc.params.push({type:params[0],varname:params[1]});
                }

              } else if (functionParams.indexOf(" ") >= 0) {
                var params = functionParams.split(" ");
                apexAuraFunc.params = [];
                apexAuraFunc.params.push({type:params[0],varname:params[1]});

              } else {
                apexAuraFunc.params = [];
              }
              apexJSON.functions.push(apexAuraFunc);
            }

            console.log(apexJSON);
            if (!fs.existsSync(search)){
                fs.mkdirSync(search);
            }

            console.log("writing cmp");
            dust.renderSource(component_dust, apexJSON, function(error, html) {
                fs.writeFile("./"+search+"/"+search+".cmp", html, function(err) {
                      if(err) {
                          console.log(err);
                      }});
                });

            console.log("writing helper");
            fs.writeFile("./"+search+"/"+search+"Helper.js", helper_js, function(err) {
                  if(err) {
                      console.log(err);
                  }});

            console.log("writing controller");
            dust.renderSource(controller_dust, apexJSON, function(error, html) {
                fs.writeFile("./"+search+"/"+search+"Controller.js", html, function(err) {
                  if(err) {
                            console.log(err);
                        }});
                });

            console.log("done writing");

          } else { console.log("No such Apex Class found."); }

        });

    }
  });

}

var component_dust = `
<aura:component implements="force:appHostable,flexipage:availableForAllPageTypes,force:hasRecordId"
                controller="{name}" >

{#functions}

<div style="padding: 10px; border: 1px solid black;">
<!-- {comment} -->
{#params}<ui:inputText label="{varname}" aura:id="{varname}"  /><BR />{/params}
<ui:button label="{name} Test" aura:id="{~lb}{name}_button{~rb}" press="{~lb}!c.c_{name}{~rb}" /><BR />
<ui:outputText value="{~lb}{name}_response{~rb}" />
</div>

{/functions}

</aura:component>`;


var controller_dust = `({~lb}
{#functions}
  "invoke{name}": function(c,e,h) {~lb}
        h.invokeApex(c,"{name}",{~lb}
            {#params}{varname} : c.get("v.{varname}"){@sep}, {/sep}{/params}
            {~rb},function(response) {~lb}
              c.set("v.{name}_response",response);
            {~rb});
  {~rb}{@sep}, {/sep}
{/functions}
{~rb})`;

var helper_js= `({
    "invokeApex" : function(c,functionName,params,callback) {
        var action = c.get("c."+functionName);
        action.setParams(params);

        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                $A.log("From "+functionName+": " + response.getReturnValue());
                callback(response.getReturnValue());
            }
            else if (state === "INCOMPLETE") {
                $A.log("Incomplete response from "+functionName+": " + response.getReturnValue());
            }
            else if (state === "ERROR") {
                var errors = response.getError();
                if (errors) {
                    if (errors[0] && errors[0].message) {
                        $A.log("Error message: "+functionName+": " +
                                 errors[0].message);
                    }
                } else {
                    $A.log("Unknown error");
                }
            }
        });

        $A.enqueueAction(action);
    }
})
`;
