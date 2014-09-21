var pathJoin = require('path').join;
var express = require('express');

var MakePlatform = require('enb/lib/make');
var platform = new MakePlatform();
platform.init(process.cwd())
    .then(function () {
        platform.loadCache();
        return platform.buildTargets([])
            .then(function () {
                platform.saveCache();
                platform.destruct();
            });
    });

var app = express();

app.use(express.static(__dirname + '/../'));

var port = 1999;
app.listen(port, function () {
    console.log('Server start at http://127.0.0.1:' + port);
});
