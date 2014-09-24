module.exports = function (bt) {
    bt.match('track*', function (ctx) {
        ctx.enableAutoInit();

        ctx.setContent([{
            elem: 'text',
            content:  ctx.getParam('name')
        }, {
            elem: 'audio',
            src: ctx.getParam('src')
        }]);
    });

    bt.match('track*__text', function (ctx) {
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('track*__audio', function (ctx) {
        ctx.setInitOption('src', ctx.getParam('src'));
    });
};
