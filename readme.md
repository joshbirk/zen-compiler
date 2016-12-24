

![zen screen shot](http://i.imgur.com/o2Oaudo.gif)

##Zen Compiler

Zen is a simple node.js CLI based harness for the Force.com Tooling API. When started, it recursively watches the directory where it was run for file changes.  If it detects a file type it knows, it will attempt to save it to the Tooling API to compile.  This allows a developer to use any editor and get compiling and save time in the background.

It will then send system notifications on the current status.  If the compile is pending, it offers moderately inspirational phrases while you wait.

It supports Apex, Visualforce and Lightning Components.  To create a new lightning component, create a new directory and add an Aura component to it (like "MyComponent.cmp" or "MyComponentController.js").  The Aura Bundle will be created on the fly then.

When launched it will prompt for username, password and environment to log into Salesforce.  After that it will wait in the background for file changes.  It's not metadata based, so the structure of the directory isn't important except in the case of Lightning components (which must be in a directory named for their bundle).

It does not export anything locally, nor is it suitable for large deployments.  [Force.com CLI](https://force-cli.heroku.com/) is recommended for that, or similar tools.

This is not an official product of Salesforce and is offered without guarantee or any promise of support.
