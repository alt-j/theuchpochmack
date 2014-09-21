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

            this._tracks = Track.findAll(this.getDomNode());
            this._currentTrackIndex = null;

            this._buffers = {};
            this._buffersCallbacks = {};

            var _this = this;
            this._tracks.forEach(function (track) {
                _this._loadSoundFile(track.getSourceUrl());
                _this._bindTo(track, 'click', _this._onTrackClick);
            });
        },

        _loadSoundFile: function (url) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';

            var _this = this;
            xhr.onload = function (e) {
                _this._context.decodeAudioData(
                    this.response,
                    function(decodedArrayBuffer) {
                        _this._buffers[url] = decodedArrayBuffer;

                        if (typeof _this._buffersCallbacks[url] == 'function') {
                            _this._buffersCallbacks[url]();
                            _this._buffersCallbacks[url] = null;
                        }
                    }, function(e) {
                        console.log('Error decoding file', e);
                    }
                );
            };
            xhr.send();
        },

        _onTrackClick: function (e) {
            var trackIndex = null;
            var track = this._tracks.filter(function (track, index) {
                if (track.getSourceUrl() == e.data.url) {
                    trackIndex = index;
                    return true;
                }
                return false;
            }).pop();

            if (this._currentTrackIndex == trackIndex) {
                track.stop();
                this._stop();

                this._currentTrackIndex = null;
            } else {
                if (this._currentTrackIndex != null) {
                    this._tracks[this._currentTrackIndex].stop();
                }
                track.play();
                this._play(e.data.url);

                this._currentTrackIndex = trackIndex;
            }
        },

        _play: function (url) {
            if (this._source) {
                this._stop();
            }

            if (this._buffers[url]) {
                this._source = this._context.createBufferSource();
                this._source.buffer = this._buffers[url];

                var destination = this._context.destination;
                this._source.connect(destination);

                this._source.start(0);

                this._turntable.start(1);

                this._source.onended = this._onTrackEnd.bind(this);
            } else {
                var _this = this;
                this._buffersCallbacks[url] = function () {
                    _this._play(url);
                };
            }
        },

        _stop: function () {
            var url = this._tracks[this._currentTrackIndex].getSourceUrl();
            if (this._buffersCallbacks[url]) {
                this._buffersCallbacks[url] = null;
            }

            this._source.stop(0);
            this._source.onended = null;

            this._source = null;

            this._turntable.stop();
        },

        _onTrackEnd: function () {
            this._onTrackClick({
                data: {
                    url: this._tracks[this._currentTrackIndex].getSourceUrl()
                }
            });
        }
    }, {
        getBlockName: function () {
            return 'player';
        }
    });

    provide(Player);
});
