

![zen screen shot](http://i.imgur.com/o2Oaudo.gif)

##Zen Compiler

Zen is a simple node.js CLI based harness for the Force.com Tooling API. When started, it recursively watches the directory where it was run for file changes.  If it detects a file type it knows, it will attempt to save it to the Tooling API to compile.  This allows a developer to use any editor and get compiling and save time in the background.

It will then send system notifications on the current status.  If the compile is pending, it offers moderately inspirational phrases while you wait.

It supports Apex, Visualforce and Lightning Components.  To create a new lightning component, create a new directory and add an Aura component to it (like "MyComponent.cmp" or "MyComponentController.js").  The Aura Bundle will be created on the fly then.
