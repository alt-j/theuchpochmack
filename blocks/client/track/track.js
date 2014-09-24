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
        },

        getMediaElement: function () {
            if (!this._mediaElement) {
                this._mediaElement = this._createMediaElement();
            }
            return this._mediaElement;
        },

        _createMediaElement: function () {
            var src = this._getOptions().src;
            var mediaElement = $('<audio>').attr('src', src);

            return mediaElement.get(0);
        }
    }, {
        getBlockName: function () {
            return 'track';
        }
    });

    provide(Track);
});
