module.exports = function (bt) {
    bt.match('turntable*', function (ctx) {
    	ctx.enableAutoInit();
    });
};
