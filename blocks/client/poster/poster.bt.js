module.exports = function (bt) {
    bt.match('poster*', function (ctx) {
        ctx.setContent({
            elem: 'image'
        });
    });

    bt.match('poster*__image', function (ctx) {
    });
};
