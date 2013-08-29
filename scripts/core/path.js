// ### Path

// Basic path.
// Path = [key1]:key2:key3:value
IV.Path = function(str) {
    if(!str) str = "";
    var slices = str.split(":");
    this.components = [];
    for(var i = 0; i < slices.length; i++) {
        var c = slices[i];
        if(c[0] == "[" && c[c.length - 1] == "]") {
            this.components.push({
                type: "iterate",
                name: c.substr(1, c.length - 2)
            });
        } else {
            this.components.push({
                type: "object",
                name: c
            });
        }
    }
};
IV.Path.prototype.slice = function(start, length) {
    var sliced = new IV.Path();
    sliced.components = this.components.slice(start, length);
};
IV.Path.prototype._enumerate_internal = function(ctx, subdata, index, cb) {
    if(index >= this.components.length) {
        cb(ctx);
    } else {
        var c = this.components[index];
        if(c.type == "iterate") {
            var array = subdata[c.name];
            for(var i = 0; i < array.length; i++) {
                ctx.components[index].obj = array[i];
                this._enumerate_internal(ctx, array[i], index + 1, cb);
            }
        } else {
            ctx.components[index].obj = subdata[c.name];
            this._enumerate_internal(ctx, subdata[c.name], index + 1, cb);
        }
    }
};
IV.PathContext = function(root, components) {
    this.root = root;
    this.components = components;
};
IV.PathContext.prototype.clone = function() {
    return new IV.PathContext(this.root, this.components.map(function(c) {
        return {
            type: c.type,
            name: c.name,
            obj: c.obj
        };
    }));
};
IV.PathContext.prototype.val = function() {
    if(this.components.length > 0)
        return this.components[this.components.length - 1].obj;
    return this.root;
};
// Get value from another path.
IV.PathContext.prototype.get = function(path) {
    var i = 0;
    var rc = [];
    var obj = this.root;
    for(; i < this.components.length && i < path.components.length; i++) {
        var tc = this.components[i];
        var pc = path.components[i];
        if(tc.name != pc.name) {
            break;
        } else {
            rc.push(tc);
            obj = tc.obj;
        }
    }
    for(; i < path.components.length; i++) {
        var pc = path.components[i];
        var nc = {
            type: pc.type,
            name: pc.name,
            obj: obj[pc.name]
        };
        obj = nc.obj;
        rc.push(nc);
    }
    return new IV.PathContext(this.root, rc);
};
IV.Path.prototype.enumerate = function(data, callback) {
    if(!callback) return;
    var components = this.components.map(function(c) {
        return {
            type: c.type,
            name: c.name,
            obj: null
        };
    });
    var ctx = new IV.PathContext(data, components);
    this._enumerate_internal(ctx, data, 0, callback);
};
IV.Path.prototype.toString = function() {
    return this.components.map(function(c) {
        if(c.type == "iterate") return "[" + c.name + "]";
        return c.name;
    }).join(":");
};
