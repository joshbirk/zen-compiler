#!/usr/bin/env node
var fs = require('fs');
var notifier = require('node-notifier');
var jsforce = require('jsforce');
var prompt = require('prompt');
var colors = require("colors/safe");
var commandLineArgs = require('command-line-args')

var zen = require('./index');

//argument handling
var optionDefinitions = [
  { name: 'token', alias: 't', type: String },
  { name: 'instance', alias: 'i', type: String },
  { name: 'help', alias: 'h', type: Boolean, defaultOption: false },
  { name: 'file', alias: 'f', type: String },
  { name: 'pause', alias: 'p', type: Number, defaultOption: 500 }
]

var args = commandLineArgs(optionDefinitions);

if(args.file != null) { zen.all_phrases = fs.readFileSync(args.file).toString().split("\n"); }

console.log(colors.blue(zen.getWaitPhrase()));

prompt.message = colors.rainbow("zenc ");
prompt.delimiter = colors.reset("");

var previous = null;
if (fs.existsSync('.zen')){
    cookie = fs.readFileSync('.zen');
    previous = JSON.parse(cookie);
}


var prompt_schema = null;
if(!args.token && !previous.accessToken) {
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
}

var conn = null;
if(!previous.accessToken) {
    prompt.start();
    prompt.get(prompt_schema, function (err, result) {
        if(result.username == '' && previous) { result.username = previous.username; }
        if(result.environment == '' && previous) { result.environment = previous.environment; }
        if(result.environment == '' && !previous) { result.environment = 'login'; }

        zen.loginAndRun(result.username,result.password,result.environment);
        fs.writeFile(".zen", '{"username":"'+result.username+'","environment":"'+result.environment+'"}', function(err) {
              if(err) {
                  return console.log(err);
              }});
      });
} else {
  zen.loginAndRunWithToken(previous.instanceUrl,previous.accessToken);
}
