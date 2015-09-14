# backbone-introspector
Backbone app introspection - generate a tree graph of your app's components (using d3.js)

## Requirements
* Backbone app
* modules loaded with require.js

## Preview
![Screenshot](/examples/screenshot.png?raw=true)
also check examples dir for a TodoMVC implementation

## Installation
in your main.js
```javascript
require([
	'backbone',
	'views/app',
	'routers/router',
	//require the introspector file
	'introspector'
], function (Backbone, AppView, Workspace, introspector) {
	/*jshint nonew:false*/
	// Initialize routing and start Backbone.history()
	new Workspace();
	Backbone.history.start();

	// Initialize the application view
	window.todoApp = new AppView();
  
  //attach introspector to window object so we can access it globally anytime from console
	window.introspector = introspector;
});
```

## Usage
from console:
```javascript
//only dump the app structure
introspector.introspect(todoApp);

//render tree in new popup window, show models in as well
introspector.renderTree(todoApp, {models: true})
```
