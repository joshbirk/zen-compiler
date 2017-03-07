

![zen screen shot](http://i.imgur.com/o2Oaudo.gif)

#Zen Compiler

On Github: https://github.com/joshbirk/zen-compiler

Zen is a simple node.js CLI based harness for the Force.com Tooling API. When started, it recursively watches the directory where it was run for file changes.  If it detects a file type it knows, it will attempt to save it to the Tooling API to compile.  This allows a developer to use any editor and get compiling and save time in the background.

It will then send system notifications on the current status.  If the compile is pending, it offers moderately inspirational phrases while you wait.

It supports Apex, Visualforce and Lightning Components.  To create a new lightning component, create a new directory and add an Aura component to it (like "MyComponent.cmp" or "MyComponentController.js").  The Aura Bundle will be created on the fly then.  To create a new Apex or Visualforce element, just create a file with the right extension (cls, page, trigger or component).

When launched it will prompt for username, password and environment to log into Salesforce.  After that it will wait in the background for file changes.  It's not metadata based, so the structure of the directory isn't important except in the case of Lightning components (which must be in a directory named for their bundle).

To install:

```
npm install zen-compiler -g
```

And then to use, just go to a working directy and on the command line:

```
zenc
```

##zen fetch
As of 1.0.4, zen now includes zen fetch.  Login is the same prompt based system as zenc, but will also prompt for a search keyword.  It will then pull Apex, Visualforce and Lightning that have the keyword in the file name and save them into corresponding directories.  Remember that as long as the lightning sub-components are in a directory named after their bundle it doesn't matter how the directory is setup to zenc, so feel free to re-organize.

To use, just enter on the command line:

```
zenf
```

Remember that zen is meant for quick development and not as a build tool.  For more options for working with Force.com from the CLI, install [Force.com CLI](https://force-cli.heroku.com/).

###1.0.7 Updates
* Bug fixes and cleanup
* Moved phrase file to a specific arg, -f (ie zenc -f filename.txt)
* Starting to migrate all command line args to command-line-args
* Added completely undocumented feature: zenla


###1.0.4 Upates
* You can now specify a newline delimited file to override the moderately inspirational phrases.
* Username and environment choices) are stored in a file (.zen) for future prompts.  Passwords are not stored anywhere.
* Login is now the default environment
* Moderately inspirational colors added to log
* Empty files will not be sent to the Tooling API
* Added zen fetch (see above)
* A few tweaks to the API call loop




## Disclaimer
I have tried to make it cross platform by design, but I have only been able to test it on OSX.  This is not an official product of Salesforce and is offered without guarantee or any promise of support.
