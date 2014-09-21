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

            this._sourceUrl = this._findElement('audio').attr('src');
            this._bindTo(this.getDomNode(), 'click', this._onClick);
        },

        getSourceUrl: function () {
            return this._sourceUrl;
        },

        play: function () {
            this._setState('played');
        },

        stop: function () {
            this._removeState('played');
        },

        _onClick: function () {
            this.emit('click', {
                url: this._sourceUrl
            });
        }
    }, {
        getBlockName: function () {
            return 'track';
        }
    });

    provide(Track);
});
