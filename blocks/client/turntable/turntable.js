modules.define('turntable', [
        'jquery',
        'block',
        'inherit'
    ], function (
        provide,
        $,
        Block,
        inherit
    ) {

    var Turntable = inherit(Block, {
        __constructor: function (domNode, options) {
            this.__base.apply(this, arguments);

            var options = this._getOptions() || {};

            this._repaintTimeout = options.repaintTimeout || 50;
            this._overclockingTime = options.overclockingTime || 3000;
        },

        start: function (frequency) {
            if (this._intervalStartingId) {
                clearInterval(this._intervalStartingId);
            }

            this._frequency = frequency || 0;
            this._delta = this._delta || 0;

            var _this = this;
            this._turnAcceleration(function () {
                if (!_this._frequency) {
                    clearInterval(_this._intervalRotationId);
                    _this._intervalRotationId = 0;
                }
            });
            if (this._frequency && !this._intervalRotationId) {
                this._turnRotation();
            }

            return this;
        },

        stop: function () {
            return this.start(0);
        },

        _turnAcceleration: function (callback) {
            var delta = 360 * this._repaintTimeout * this._frequency / 1000;
            this._acceleration = this._repaintTimeout * (delta - this._delta) / this._overclockingTime;

            var _this = this;

            this._intervalStartingId = setInterval(function () {
                _this._delta += _this._acceleration;

                if (
                    _this._acceleration >= 0 && _this._delta >= delta ||
                    _this._acceleration < 0 && _this._delta <= delta
                ) {
                    clearInterval(_this._intervalStartingId);
                    _this._intervalStartingId = 0;
                    if (typeof callback == 'function') {
                        callback();
                    }
                }
            }, this._repaintTimeout);
        },

        _turnRotation: function () {
            var _this = this;
            var node = this.getDomNode();
            this.currentRotationAngle = this.currentRotationAngle || 0;

            this._intervalRotationId = setInterval(function () {
                if (_this.currentRotationAngle >= 360) {
                    _this.currentRotationAngle -= (360 - _this._delta);
                } else {
                    _this.currentRotationAngle += _this._delta;
                }
                node.css('transform', 'rotate(' + _this.currentRotationAngle + 'deg)');
            }, this._repaintTimeout);
        }
    }, {
        getBlockName: function () {
            return 'turntable';
        }
    });

    provide(Turntable);
});
