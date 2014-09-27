module.exports = function (bt) {
    bt.match('track*', function (ctx) {
        ctx.enableAutoInit();

        ctx.setInitOption('src', ctx.getParam('src'));

        ctx.setContent([{
            elem: 'text',
            content:  ctx.getParam('name')
        }]);
    });

    bt.match('track*__text', function (ctx) {
        ctx.setContent(ctx.getParam('content'));
    });
};
