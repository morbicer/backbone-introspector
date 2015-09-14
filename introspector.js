define(function(require) {

    var d3 = require("http://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js");
    var _ = require("underscore");
    var Backbone = require("backbone");

    /*
        find the supplied object in required.js modules
    */
    function findModule(obj) {
        var name = null,
            found = null;
        var modules = requirejs.s.contexts["_"].defined;

        for (name in modules) {
            if (typeof modules[name] === "function" && obj instanceof modules[name]) {
                found = name;
            }
        }
        return found;
    }


    /*
        determine if the supplied object is a Backbone instance
    */
    function getBackboneComponent(obj, config) {
        var proto;

        if (obj instanceof Backbone.Model && config.models) {
            proto = "model";
        }
        if (obj instanceof Backbone.View && config.views) {
            proto = "view";
        }
        if (obj instanceof Backbone.Collection && config.collections) {
            proto = "collection";
        }

        return proto;
    }

    /*
        recursively introspect object = find a requirejs file & backbone class type,
        loop over object attributes and do the same for them

        config: pass {views: true, models: true, collections: true} to display all
        components (if no config is passed, show only views)
    */
    function introspect(obj, userConfig) {
        var config = _.extend({
            views: true,
            models: false,
            collections: false
        }, userConfig);

        var node = null;
        var module = findModule(obj);
        var backboneComponent = getBackboneComponent(obj, config);

        if (module != null && backboneComponent != null) {
            node = {
                key: "",
                module: module,
                backboneComponent: backboneComponent,
                obj: obj,
                children: []
            }

            for (var key in obj) {
                if (obj[key] != null) {
                    //prevent circular loop
                    if (key == "collection") {
                        continue;
                    }

                    //try to introspect direct object attributes
                    childNode = introspect(obj[key], config);
                    if (childNode != null) {
                        childNode.key = key;
                        node.children.push(childNode);
                    }

                    //if attribute is array, inspect it's members as well
                    else if(obj[key] instanceof Array) {
                        obj[key].forEach(function(item, i) {
                            childNode = introspect(item, config);
                            if (childNode != null) {
                                childNode.key = key+"["+i+"]";
                                node.children.push(childNode);
                            }
                        });
                    }

                    //if attribute is simple hashmap, inspect it's members as well
                    //ignore internal backbone attributes like _listener, _events, _changing etc
                    else if (typeof obj[key] === "object" && Object.getPrototypeOf(obj[key]) == Object.prototype && key[0] != "_" && key != "options") {
                        for (var key2 in obj[key]) {
                            childNode = introspect(obj[key][key2], config);
                            if (childNode != null) {
                                childNode.key = key + "[" + key2 + "]";
                                node.children.push(childNode);
                            }
                        }
                    }
                }
            }
        }

        return node;
    }

    /*
        Transform introspected backbone objects into d3 tree format
    */
    function treeify(obj, parent) {
        if (parent != null) {
            var key;
            for (key in parent.children) {
                if (obj == parent.children[key]) break;
            }
        }

        var item = {
            data: obj,
            children: obj.children.map(function(child) {
                return treeify(child, obj);
            })
        }

        return item;
    }

    /*
        Based on tree depth, calculate optimal svg dimensions
    */
    function computeSvgSizeFromData(treeRoot) {
        var tree = d3.layout.tree(),
        nodes = tree.nodes(treeRoot);

        var maxTreeChildrenHeight = {},
        maxTreeHeight = 0,
        maxTreeDepth = 0,
        minSvgWidth,
        minSvgHeight;

        // Compute the max tree depth(node which is the lowest leaf)
        nodes.forEach(function(d) {
          if(d.depth>maxTreeDepth){
              maxTreeDepth = d.depth;
          }

          if(!maxTreeChildrenHeight[d.depth]){
              maxTreeChildrenHeight[d.depth] = 0;
          }

          maxTreeChildrenHeight[d.depth] = maxTreeChildrenHeight[d.depth]+1;
        });

        // Compute maximum number of vertical at a level
        maxTreeHeight = _.max(_.values(maxTreeChildrenHeight));

        // Since this is a horizontal tree, compute the width
        // based upon the depth and the height based upon
        // the number of nodes at a depth level
        minSvgWidth = (maxTreeDepth+1)*220;
        minSvgHeight = (maxTreeHeight+1)*50;

        return {
            width: minSvgWidth,
            height: minSvgHeight
        };
    }


    /*
        Based on element (and backboneComponent), return style rules for svg elements
    */
    function getStyle(el)
    {
        var viewColor = "#f00";
        var modelColor = "#00f";
        var collectionColor = "#0f0";

        var allStyles = {
            circle: {
                default: {
                    strokeWidth: "1px",
                    fill: "#fff",
                    stroke: "#ccc"
                },
                view: {
                    stroke: viewColor,
                    fill: viewColor,
                },
                model: {
                    stroke: modelColor,
                    fill: modelColor,
                },
                collection: {
                    stroke: collectionColor,
                    fill: collectionColor,
                }
            },
            text: {
                default: {
                    fill: '#000'
                },
                view: {
                    fill: viewColor,
                },
                model: {
                    fill: modelColor,
                },
                collection: {
                    fill: collectionColor,
                }
            }
        };

        var styles = {};

        Object.keys(allStyles[el].default).forEach(function(key) {
            if (key == "fill" && el != "text") {
                styles[key] = function(d){
                    return (!d.children && d._children) ? allStyles[el][d.data.backboneComponent][key] : "#fff"
                };
            }
            else {
                styles[key] = function(d){
                    return allStyles[el][d.data.backboneComponent][key] || allStyles[el]["default"][key]
                };
            }
        });

        return styles;
    }


    /*
        Core function, render the tree using d3 in new popup window
        for config see introspect function
    */
    function renderTree(obj, config) {
        var obj2 = introspect(obj, config);
        var treeData = [treeify(obj2)];

        var treeRoot = treeData[0];
        var svgDimensions = computeSvgSizeFromData(treeRoot);

        treeRoot.x0 = svgDimensions.height / 2;
        treeRoot.y0 = 0;

        var margin = {
            top: 50,
            left: 150
        };

        var diagonal = d3.svg.diagonal()
            .projection(function(d) {
                return [d.y, d.x];
            });

        var popupConfig = "innerHeight="+(svgDimensions.height + margin.top)+",width="+(svgDimensions.width + margin.left)+",scrollbars=1";
        var popup = window.open(null, "popupInspector", popupConfig);
        if (!popup) {
            alert("Backbone Introspector: Please enable opening popups");
        }
        popup.document.open();
        popup.document.write("<html><body></body></html>");
        popup.document.title = "Backbone Inspector";

        var svg = d3.select(popup.document.body).append("svg")
            .attr("width", svgDimensions.width + margin.left)
            .attr("height", svgDimensions.height + margin.top)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var tree = d3.layout.tree();

        update(treeRoot);

        function update(source) {
            var duration = d3.event && d3.event.altKey ? 5000 : 500;

            var newSize = computeSvgSizeFromData(treeRoot);
            tree.size([newSize.height, newSize.width]);

            // Compute the new tree layout.
            var nodes = tree.nodes(treeRoot).reverse(),
                links = tree.links(nodes);

            // Normalize for fixed-depth.
            nodes.forEach(function(d) {
                d.y = d.depth * 220;
            });

            // Enter any new nodes at the parent's previous position
            var i = 0;
            var node = svg.selectAll("g.node")
                .data(nodes, function(d) {
                    return d.id || (d.id = ++i);
                });

            // Enter the nodes.
            var nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
                .on("click", function(d) { toggle(d); update(d); });

            nodeEnter.append("circle")
                .attr("r", 5)
                .style(getStyle("circle"));

            nodeEnter.append("text")
                .attr("x", function(d) {
                    return (d.children || d._children) ? -15 : 15;
                })
                .attr("dy", ".35em")
                .attr("text-anchor", function(d) {
                    return (d.children || d._children) ? "end" : "start";
                })
                .text(function(d) {
                    return d.data.key;
                })
                .style(getStyle("text"));

            nodeEnter.append("text")
                .attr("x", function(d) {
                    return (d.children || d._children) ? -15 : 15;
                })
                .attr("dy", "1.4em")
                .attr("text-anchor", function(d) {
                    return (d.children || d._children) ? "end" : "start";
                })
                .attr("class", "module")
                .text(function(d) {
                    return d.data.module;
                })
                .style("font-size", "0.8em");

            // Transition nodes to their new position.
            var nodeUpdate = node.transition()
              .duration(duration)
              .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

            nodeUpdate.select("circle")
              .attr("r", 5)
              .style(getStyle("circle"));

            nodeUpdate.select("text")
              .style("fill-opacity", 1);

            // Transition exiting nodes to the parent's new position.
            var nodeExit = node.exit().transition()
              .duration(duration)
              .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
              .remove();

            nodeExit.select("circle")
              .attr("r", 1e-6);

            nodeExit.select("text")
              .style("fill-opacity", 1e-6);




            // Declare the links¦
            var link = svg.selectAll("path.link")
                .data(links, function(d) {
                    return d.target.id;
                });

            // Enter the links.
            link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", function(d) {
                    var o = {x: source.x0, y: source.y0};
                    return diagonal({source: o, target: o});
                  })
                .style({
                    fill: "none",
                    stroke: "#ccc",
                    strokeWidth: "1.5px"
                })
                .transition()
                  .duration(duration)
                  .attr("d", diagonal);

            // Transition links to their new position.
            link.transition()
              .duration(duration)
              .attr("d", diagonal);

            // Transition exiting nodes to the parent's new position.
            link.exit().transition()
              .duration(duration)
              .attr("d", function(d) {
                var o = {x: source.x, y: source.y};
                return diagonal({source: o, target: o});
              })
              .remove();

            // Stash the old positions for transition.
            nodes.forEach(function(d) {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        }
    }

    // Toggle children.
    function toggle(d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
    }

    return {
        introspect: introspect,
        renderTree: renderTree
    };

});