#!/usr/bin/env node
var fs = require('fs');
var notifier = require('node-notifier');
var jsforce = require('jsforce');
var prompt = require('prompt');
var colors = require("colors/safe");

var options = {
  showNotify: true,
  showOnSuccess: true,
  dir_delimiter: '/',
  API: 38.0,
  env: 'https://test.salesforce.com'
}

var previous = null;
if (fs.existsSync('.zen')){
    cookie = fs.readFileSync('.zen');
    previous = JSON.parse(cookie);
}

prompt.message = colors.rainbow("zenf ");
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
            message: 'Search for:',
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
          message: 'Search for:',
          required: true
        }
      }
      }
}

var conn = null;
var returns = 0;

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
    //Apex
    //Classes
    conn.query("SELECT Name, Body from ApexClass where Name LIKE '%"+search+"%'",function(err,result){
      if (!fs.existsSync('apex')){
          fs.mkdirSync('apex');
      }
      for(var x = 0; x < result.records.length; x++) {
        fs.writeFile("./apex/"+result.records[x].Name+".cls", result.records[x].Body, function(err) {
              if(err) {
                  return console.log(err);
              }});
      }
    });

    //Triggers
    conn.query("SELECT Name, Body from ApexTrigger where Name LIKE '%"+search+"%'",function(err,result){
      if (!fs.existsSync('apex')){
          fs.mkdirSync('apex');
      }
      for(var x = 0; x < result.records.length; x++) {
        fs.writeFile("./apex/"+result.records[x].Name+".trigger", result.records[x].Body, function(err) {
              if(err) {
                  return console.log(err);
              }});
      }
    });

    //Visualforce
    //Pages
    conn.query("SELECT Name, Markup from ApexPage where Name LIKE '%"+search+"%'",function(err,result){
      if (!fs.existsSync('visualforce')){
          fs.mkdirSync('visualforce');
      }
      for(var x = 0; x < result.records.length; x++) {
        fs.writeFile("./visualforce/"+result.records[x].Name+".page", result.records[x].Markup, function(err) {
              if(err) {
                  return console.log(err);
              }});
      }
    });
    //Components
    conn.query("SELECT Name, Markup from ApexPage where Name LIKE '%"+search+"%'",function(err,result){
      if (!fs.existsSync('visualforce')){
          fs.mkdirSync('visualforce');
      }
      for(var x = 0; x < result.records.length; x++) {
        fs.writeFile("./visualforce/"+result.records[x].Name+".page", result.records[x].Markup, function(err) {
              if(err) {
                  return console.log(err);
              }});
      }
    });

    //Aurabundles
    conn.tooling.query("SELECT Id, DeveloperName from AuraDefinitionBundle where DeveloperName LIKE '%"+search+"%'",function(err,result){
      if (!fs.existsSync('lightning')){
          fs.mkdirSync('lightning');
      }
      for(var x = 0; x < result.records.length; x++) {
        if (!fs.existsSync('./lightning/'+result.records[x].DeveloperName)){
            fs.mkdirSync('./lightning/'+result.records[x].DeveloperName);
        }
        var bundle = result.records[x].DeveloperName;
        conn.tooling.query("SELECT Id, Format, DefType, Source from AuraDefinition where AuraDefinitionBundleId = '"+result.records[x].Id+"'",function(err,result){
          for(var x = 0; x < result.records.length; x++) {
            var file_name = bundle;
            if(result.records[x].DefType == 'CONTROLLER') { file_name += 'Controller.js'; }
            if(result.records[x].DefType == 'HELP') { file_name += 'Helper.js'; }
            if(result.records[x].DefType == 'RENDERER') { file_name += 'Renderer.js'; }
            if(result.records[x].DefType == 'COMPONENT') { file_name += '.cmp'; }
            if(result.records[x].DefType == 'STYLE') { file_name += '.css'; }
            if(result.records[x].DefType == 'DOCUMENTATION') { file_name += '.auradoc'; }
            fs.writeFile("./lightning/"+bundle+"/"+file_name, result.records[x].Source, function(err) {
                  if(err) {
                      return console.log(err);
                  }});
            }
        });
      }
    });
  }

});

}
