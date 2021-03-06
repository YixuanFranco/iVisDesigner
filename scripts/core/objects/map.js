// iVisDesigner - scripts/core/objects/map.js
// Author: Donghao Ren
//
// LICENSE
//
// Copyright (c) 2014, The Regents of the University of California
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors
//    may be used to endorse or promote products derived from this software without
//    specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
// IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
// INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
// BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
// LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
// OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
// OF THE POSSIBILITY OF SUCH DAMAGE.

(function() {

// Mercator Projection
var GoogleMapMercator = function(lng, lat) {
    var x = lng;
    var rlat = lat / 180.0 * Math.PI;
    var y = Math.log( (1 + Math.sin(rlat)) / (1 - Math.sin(rlat)) ) / 2;
    return new IV.Vector(x / 360.0, y / Math.PI / 2);
};

var GoogleMapMercatorInverse = function(x, y) {
    var tanh = function(x) {
        return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
    };
    lng = x * 360.0;
    lat = 180 * Math.asin(tanh(2 * Math.PI * y)) / Math.PI;
    return [lng, lat];
};

var GoogleMapImage = function(maptype, zoom) {
    this.maptype = maptype;
    this.zoom = zoom;
    this.map_width = 256 * (1 << this.zoom);
    this.images = { };
    this.callback = function() { };
};
G_T = 0;
GoogleMapImage.prototype.renderImages = function(g, cx, cy, width, height) {
    var tile_size = 512;
    var tile_count = (1 << this.zoom) / 2;
    var x_min = Math.floor((cx) / tile_size);
    var x_max = Math.floor((cx + width) / tile_size);
    var y_min = Math.floor((cy) / tile_size);
    var y_max = Math.floor((cy + height) / tile_size);
    if(y_min < 0) y_min = 0; if(y_min >= tile_count) y_min = tile_count - 1;
    if(y_max < 0) y_max = 0; if(y_max >= tile_count) y_max = tile_count - 1;
    for(var x = x_min; x <= x_max; x++) {
        for(var y = y_min; y <= y_max; y++) {
            var tile = this.requestTile((x % tile_count + tile_count) % tile_count, y);
            try {
                var sx = 64, sy = 64, sw = tile_size, sh = tile_size;
                var dx = x * tile_size - cx, dy = y * tile_size - cy;
                if(dx < 0) { sx -= dx; sw += dx; dx = 0; }
                if(dy < 0) { sy -= dy; sh += dy; dy = 0; }
                if(dx + sw > width) { sw = width - dx; }
                if(dy + sh > height) { sh = height - dy; }
                if(sw > 0 && sh > 0 && dx < width && dy < height) {
                    g.drawImage(tile, sx * 2, sy * 2, sw * 2, sh * 2, dx, dy, sw, sh);
                }
            } catch(e) { }
        }
    }
    this.purgeImages();
};

GoogleMapImage.prototype.purgeImages = function() {
    var now = new Date().getTime();
    for(var k in this.images) {
        if(now - this.images[k].last_used > 10000 * 1000) delete this.images[k];
    }
};

GoogleMapImage.prototype.requestTile = function(x, y) {
    var key = this.maptype + "," + x + "," + y;
    var $this = this;
    if(this.images[key]) {
        this.images[key].last_used = new Date().getTime();
        return this.images[key].img;
    } else {
        var o = {
            img: new Image(),
            last_used: new Date().getTime()
        };
        o.img.onload = function() {
            $this.callback($this);
        };
        o.img.src = this.getTileURL(x, y);
        this.images[key] = o;
        return o.img;
    }
};

GoogleMapImage.prototype.getTileURL = function(x, y) {
    // In this function we work in the GoogleMapMercator coordinate, world range: -0.5 ~ 0.5.
    var cell_width = Math.pow(2, -(this.zoom - 1));
    var xy_first_cell = -0.5 + cell_width / 2.0;
    var lnglat = GoogleMapMercatorInverse(xy_first_cell + cell_width * x, -xy_first_cell - cell_width * y);
    var params = {
        center: lnglat[1] + "," + lnglat[0], // lat,lng
        zoom: this.zoom,
        size: "640x640",
        sensor: "false",
        scale: 2,
        maptype: this.maptype,
        key: "AIzaSyBWFLxkr7mBCEpjyJotpP50n_ZOtcW-RTo",
        language: "en_US",
        visual_refresh: "true"
    };
    if(IV.server && IV.server.getDelegateURL) {
        return IV.server.getDelegateURL("https://maps.googleapis.com/", "maps/api/staticmap", params);
    } else {
        var baseurl = "https://maps.googleapis.com/maps/api/staticmap";
        var params_array = [];
        for(var key in params) {
            params_array.push(escape(key) + "=" + escape(params[key]));
        }
        return baseurl + "?" + params_array.join("&");
    }
};

var GoogleMapStatic = function(lng, lat, zoom, size_x, size_y, maptype, scale) {
    this.center_lng = lng;
    this.center_lat = lat;
    this.zoom = zoom;
    this.size_x = size_x;
    this.size_y = size_y;
    this.scale = scale;
    this.maptype = maptype;
    this.images = { };
};

GoogleMapStatic.prototype = {
    lngLatToPixel: function(lng, lat, zoom) {
        var world_width = 256 * Math.pow(2, this.zoom);
        var pt = GoogleMapMercator(lng, lat);
        var p0 = GoogleMapMercator(this.center_lng, this.center_lat);
        var sh = pt.sub(p0).scale(world_width);
        return sh.add(new IV.Vector(this.size_x / 2, this.size_y / 2));
    },
    lngLatToPixelCentered: function(lng, lat) {
        var world_width = 256 * Math.pow(2, this.zoom);
        var pt = GoogleMapMercator(lng, lat);
        var p0 = GoogleMapMercator(this.center_lng, this.center_lat);
        var sh = pt.sub(p0).scale(world_width);
        return sh;
    },
    pixelToLngLatCentered: function(x, y) {
        var world_width = 256 * Math.pow(2, this.zoom);
        var p0 = GoogleMapMercator(this.center_lng, this.center_lat);
        x /= world_width;
        y /= world_width;
        x += p0.x;
        y += p0.y;
        return GoogleMapMercatorInverse(x, y);
    },
    render: function(g) {
        var map_zoom = Math.round(this.zoom);
        if(map_zoom < 1) map_zoom = 1; if(map_zoom > 22) map_zoom = 22;
        if(!this.delegate || this.delegate.zoom != map_zoom) {
            this.delegate = new GoogleMapImage(this.maptype, map_zoom);
            var self = this;
            this.delegate.callback = function(s) {
                if(self.callback && self.delegate == s) self.callback(self);
            };
        }
        g.save();
        this.delegate.maptype = this.maptype;
        var my_world_width = 256 * Math.pow(2, this.zoom);
        var s = my_world_width / this.delegate.map_width;
        g.scale(s, s);
        var p0 = GoogleMapMercator(this.center_lng, -this.center_lat);
        var sh = p0.scale(this.delegate.map_width).add(new IV.Vector(this.delegate.map_width / 2, this.delegate.map_width / 2));
        g.translate(-this.size_x / s / 2, -this.size_y / s / 2);
        this.delegate.renderImages(g, sh.x - this.size_x / s / 2, sh.y - this.size_y / s / 2, this.size_x / s, this.size_y / s);
        g.restore();
    }
};

// IV.vis.addObject(new Objects.GoogleMap("stations:lng", "stations:lat", new IV.Vector(0, 0), 116.37371, 39.86390, 10));
Objects.GoogleMap = IV.extend(Objects.Object, function(info) {
    Objects.Object.call(this);
    var $this = this;
    this.type = "GoogleMap";
    this.path = new IV.Path();
    this.maptype = "roadmap";
    this.longitude = info.longitude;
    this.latitude = info.latitude;
    this.scale = info.scale;
    this.center_offset = info.center;
    this.path_longitude = info.path_longitude;
    this.path_latitude = info.path_latitude;
    this.size_x = info.size_x ? info.size_x : 640;
    this.size_y = info.size_y ? info.size_y : 640;
    this.transparency = IV.notNull(info.transparency) ? info.transparency : 1;
    this.reloadMap();
}, {
    $auto_properties: [ "path_longitude", "path_latitude", "center_offset", "transparency" ],
    _set_longitude: function(val) { this.longitude = val; this.reloadMap(); },
    _get_longitude: function() { return this.longitude; },
    _set_latitude: function(val) { this.latitude = val; this.reloadMap(); },
    _get_latitude: function() { return this.latitude; },
    _set_scale: function(val) { this.scale = val; this.reloadMap(); },
    _get_scale: function() { return this.scale; },
    _set_maptype: function(val) { this.maptype = val; this.reloadMap(); },
    _get_maptype: function() { return this.maptype; },
    _set_size_x: function(val) { this.size_x = val; this.reloadMap(); },
    _get_size_x: function() { return this.size_x; },
    _set_size_y: function(val) { this.size_y = val; this.reloadMap(); },
    _get_size_y: function() { return this.size_y; },
    can: function(cap) {
        if(cap == "get-point") return true;
    },
    postDeserialize: function() {
        if(!this.maptype) this.maptype = "roadmap";
        if(!this.size_x) this.size_x = 640;
        if(!this.size_y) this.size_y = 640;
        if(IV.isNull(this.transparency)) this.transparency = 1;
        if(!this.path) this.path = new IV.Path();
        this.reloadMap();
    },
    onAttach: function(vis) {
        this.vis = vis;
    },
    reloadMap: function() {
        var $this = this;
        if(!this._map) {
            this._map = new GoogleMapStatic(this.longitude, this.latitude, this.scale, this.size_x, this.size_y, this.maptype, 2);
            this._map.callback = function(s) {
                if(s == $this._map)
                    if($this.vis) $this.vis.setNeedsRender();
            };
        } else {
            this._map.center_lng = this.longitude;
            this._map.center_lat = this.latitude;
            this._map.zoom = this.scale;
            this._map.maptype = this.maptype;
            this._map.size_x = this.size_x;
            this._map.size_y = this.size_y;
        }
    },
    render: function(g, data) {
        var $this = this;
        g.ivSave();
        g.translate(this.center_offset.x, this.center_offset.y);
        g.scale(1, -1);
        var show_rect = false;
        g.globalAlpha = this.transparency;
        this._map.render(g);
        g.ivRestore();
        var off = this.center_offset;
        if(show_rect) {
            var rect = new IV.Rectangle(off.x, off.y, this._map.size_x + 5, this._map.size_y + 5, 0);
            var c1 = rect.corner1();
            var c2 = rect.corner2();
            var c3 = rect.corner3();
            var c4 = rect.corner4();
            g.beginPath();
            g.strokeStyle = IV.colors.selection.toRGBA();
            g.lineWidth = 1.0 / g.ivGetTransform().det();
            g.moveTo(c1.x, c1.y);
            g.lineTo(c2.x, c2.y);
            g.lineTo(c3.x, c3.y);
            g.lineTo(c4.x, c4.y);
            g.closePath();
            g.stroke();
        }
    },
    get: function(context) {
        var lng = context.get(this.path_longitude).val();
        var lat = context.get(this.path_latitude).val();
        if(lng === null || lat === null) return null;
        var pt = this._map.lngLatToPixelCentered(lng, lat);
        return pt.add(this.center_offset);
    },
    renderSelected: function(g, data) {
        var rect = new IV.Rectangle(this.center_offset.x, this.center_offset.y, this._map.size_x + 5, this._map.size_y + 5, 0);
        var c1 = rect.corner1();
        var c2 = rect.corner2();
        var c3 = rect.corner3();
        var c4 = rect.corner4();
        g.beginPath();
        g.strokeStyle = IV.colors.selection.toRGBA();
        g.lineWidth = 1.0 / g.ivGetTransform().det();
        g.moveTo(c1.x, c1.y);
        g.lineTo(c2.x, c2.y);
        g.lineTo(c3.x, c3.y);
        g.lineTo(c4.x, c4.y);
        g.closePath();
        g.stroke();
    },
    beginMoveElement: function(context) {
        var $this = this;
        return {
            onMove: function(p0, p1) {
                var px = p1.x - $this.center_offset.x;
                var py = p1.y - $this.center_offset.y;
                var lnglat = $this._map.pixelToLngLatCentered(px, py);
                context.set($this.path_longitude, lnglat[0]);
                context.set($this.path_latitude, lnglat[1]);
            }
        };
    },
    select: function(pt, data, action) {
        var rect = new IV.Rectangle(this.center_offset.x, this.center_offset.y, this._map.size_x, this._map.size_y, 0);
        var rslt = null;
        if((!action || action == "move") && rect.distance(pt) < 4.0 / pt.view_scale) {
            rslt = { distance: rect.distance(pt) };
            var $this = this;
            rslt.original = $this.center_offset;
            rslt.onMove = function(p0, p1) {
                $this.center_offset = rslt.original.sub(p0).add(p1);
                return { trigger_render: "main,front,back" };
            };
        }
        if(action == "move-element" && rect.inside(pt)) {
            rslt = { distance: 10 };
            var $this = this;
            var prev = [ $this.longitude, $this.latitude ];
            rslt.onMove = function(p0, p1) {
                $this._map.center_lng = prev[0];
                $this._map.center_lat = prev[1];
                var off_p1 = $this._map.pixelToLngLatCentered(p0.x - p1.x, p0.y - p1.y);
                $this.longitude = off_p1[0];
                $this.latitude = off_p1[1];
                $this._map.center_lng = $this.longitude;
                $this._map.center_lat = $this.latitude;
                $this.reloadMap();
                return { trigger_render: "main,front,back" };
            };
        }
        return rslt;
    },
    getPropertyContext: function() {
        var $this = this;
        return Objects.Object.prototype.getPropertyContext.call(this).concat([
            make_prop_ctx($this, "path_longitude", "Longitude", "GoogleMap", "path"),
            make_prop_ctx($this, "path_latitude", "Latitude", "GoogleMap", "path"),
            make_prop_ctx(this, "scale", "Scale", "GoogleMap", "plain-number"),
            make_prop_ctx(this, "maptype", "MapType", "GoogleMap", "plain-string", ["terrain", "roadmap", "satellite", "hybrid"]),
            make_prop_ctx(this, "longitude", "Longitude", "GoogleMap", "plain-number"),
            make_prop_ctx(this, "latitude", "Latitude", "GoogleMap", "plain-number"),
            make_prop_ctx(this, "size_x", "Width", "GoogleMap", "plain-number"),
            make_prop_ctx(this, "size_y", "Height", "GoogleMap", "plain-number"),
            make_prop_ctx(this, "transparency", "Opacity", "GoogleMap", "plain-number")
        ]);
    }
});
IV.serializer.registerObjectType("GoogleMap", Objects.GoogleMap);
})();
