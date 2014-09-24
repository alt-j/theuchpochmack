modules.define('player', [
        'jquery',
        'block',
        'inherit',
        'track',
        'turntable'
    ], function (
        provide,
        $,
        Block,
        inherit,
        Track,
        Turntable
    ) {

    var Player = inherit(Block, {
        __constructor: function (domNode, options) {
            this.__base.apply(this, arguments);

            this._turntable = Turntable.find(this.getDomNode());

            this._control = this._findElement('play-button');
            this._bindTo(this._control, 'click', function () {
                if (!this._getElementState(this._control, 'reverted')) {
                    this.play();
                } else {
                    this.pause();
                }
            });

            var AudioContext = window.AudioContext || window.webkitAudioContext;
            this._context = new AudioContext();

            this._tracks = Track.findAll(this.getDomNode());
        },

        play: function (index) {
            if (!this._source || this._source.mediaElement.ended) {
                this.stop();

                this._source = this._getSource(index || 0);

                var gainNode = this._context.createGain();
                this._source.connect(gainNode);
                gainNode.connect(this._context.destination);
            }

            this._source.mediaElement.play();
            this._turntable.start(0.75);
            this._setElementState(this._control, 'reverted');

            return this;
        },

        _getSource: function (index) {
            var mediaElement = this._tracks[index].getMediaElement();
            var source = this._context.createMediaElementSource(mediaElement);

            var _this = this;

            mediaElement.addEventListener('ended', function () {
                if (_this._tracks[index + 1]) {
                    _this.play(index + 1);
                } else {
                    _this.stop();
                }
            }, true);

            mediaElement.addEventListener('error', function () {
                _this.stop();
            }, true);

            return source;
        },

        pause: function () {
            if (this._source) {
                this._source.mediaElement.pause();

                this._turntable.stop();
                this._removeElementState(this._control, 'reverted');
            }
            return this;
        },

        stop: function () {
            if (this._source) {
                this._source.disconnect();
                this._source.mediaElement.currentTime = 0;
                this._source = null;

                this._turntable.stop();
                this._removeElementState(this._control, 'reverted');
            }
            return this;
        }
    }, {
        getBlockName: function () {
            return 'player';
        }
    });

    provide(Player);
});
