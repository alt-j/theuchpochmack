modules.define('track', [
        'jquery',
        'block',
        'inherit'
    ], function (
        provide,
        $,
        Block,
        inherit
    ) {

    var Track = inherit(Block, {
        __constructor: function (domNode, options) {
            this.__base.apply(this, arguments);

            this._mediaElement = this._findElement('audio').get(0);
        },

        getMediaElement: function () {
            return this._mediaElement;
        }
    }, {
        getBlockName: function () {
            return 'track';
        }
    });

    provide(Track);
});
