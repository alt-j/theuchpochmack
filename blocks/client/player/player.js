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

            var AudioContext = window.AudioContext || window.webkitAudioContext;
            this._context = new AudioContext();

            this._turntable = Turntable.find(this.getDomNode());

            this._tracks = [];

            var _this = this;
            Track.findAll(this.getDomNode()).forEach(function (track, index) {
                var mediaElement = track.getMediaElement();

                mediaElement.addEventListener('ended', function () {
                    if (_this._tracks[index + 1]) {
                        _this._stop();
                        _this._play(_this._tracks[index + 1]);
                    } else {
                        _this._stop();
                    }
                }, true);

                var source = _this._context.createMediaElementSource(
                    track.getMediaElement()
                );
                _this._tracks.push(source);
            });

            this._power = this._findElement('power');
            this._bindTo(this._power, 'click', function () {
                this._toggleElementState(this._power, 'reverted', true, false);
                if (this._getElementState(this._power, 'reverted')) {
                    this._play();
                } else {
                    this._stop();
                }
            });
        },

        _play: function (track) {
            if (!this._source || !this._source.mediaElement.paused) {
                this._source = track || this._tracks[0];

                var gainNode = this._context.createGain();
                this._source.connect(gainNode);
                gainNode.connect(this._context.destination);
            }

            this._source.mediaElement.play();
            this._turntable.start(1);
        },

        _pause: function () {
            if (this._source) {
                this._source.mediaElement.pause();
            }
        },

        _stop: function () {
            if (this._source) {
                this._source.disconnect();
                this._source.mediaElement.currentTime = 0;
                this._source = null;

                this._turntable.stop();
            }
        }
    }, {
        getBlockName: function () {
            return 'player';
        }
    });

    provide(Player);
});
