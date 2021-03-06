module.exports = function (bt) {
    bt.match('player*', function (ctx) {
        ctx.enableAutoInit();

        ctx.setContent([{
            block: 'turntable'
        }, {
            elem: 'play-button'
        }, {
            elem: 'list',
            tracks: ctx.getParam('tracks')
        }]);
    });

    bt.match('player*__list', function (ctx) {
        var tracks = ctx.getParam('tracks')
            .map(function (item) {
                return {
                    block: 'track',
                    name: item.name,
                    src: item.src
                };
            });
        ctx.setContent(tracks);
    });
};
