if (typeof Promise === "undefined") {
(function () {
    function Promise(resolver) {
        var
        self = this,
        then = self.then = function () {
            return Promise.prototype.then.apply(self, arguments);
        };

        then.fulfilled = [];
        then.rejected = [];

        function timeout(state, object) {
            then.state = 'pending';

            if (then[state].length) setTimeout(function () {
                timeout(state, then.value = then[state].shift().call(self, object));
            }, 0);
            else then.state = state;
        }

        then.fulfill = function (object) {
            timeout('fulfilled', object);
        };

        then.reject = function (object) {
            timeout('rejected', object);
        };

        resolver.call(self, then.fulfill, then.reject);

        return self;
    }

    Promise.prototype = {
        'constructor': Promise,
        'then': function (onFulfilled, onRejected) {
            if (onFulfilled) this.then.fulfilled.push(onFulfilled);
            if (onRejected) this.then.rejected.push(onRejected);

            if (this.then.state === 'fulfilled') this.then.fulfill(this.then.value);

            return this;
        },
        'catch': function (onRejected) {
            if (onRejected) this.then.rejected.push(onRejected);

            return this;
        }
    };

    Promise.all = function () {
        var
        args = Array.prototype.slice.call(arguments),
        countdown = args.length;

        function process(promise, fulfill, reject) {
            promise.then(function onfulfilled(value) {
                if (promise.then.fulfilled.length > 1) promise.then(onfulfilled);
                else if (!--countdown) fulfill(value);

                return value;
            }, function (value) {
                reject(value);
            });
        }

        return new Promise(function (fulfill, reject) {
            while (args.length) process(args.shift(), fulfill, reject);
        });
    };

    window.Promise = Promise;
})();

}
if (!Function.prototype.bind) {
// Function.prototype.bind
Function.prototype.bind = function bind(scope) {
    var
    callback = this,
    prepend = Array.prototype.slice.call(arguments, 1),
    Constructor = function () {},
    bound = function () {
        return callback.apply(
            this instanceof Constructor && scope ? this : scope,
            prepend.concat(Array.prototype.slice.call(arguments, 0))
        );
    };

    Constructor.prototype = bound.prototype = callback.prototype;

    return bound;
};

}

/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.0
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    if(decl.state === DECL_STATES.IN_RESOLVING &&
                            curOptions.trackCircularDependencies &&
                            isDependenceCircular(decl, path)) {
                        cb(null, buildCircularDependenceError(decl, path));
                        return;
                    }

                    decls.push(decl);

                    startDeclResolving(
                        decl,
                        path,
                        function(_, error) {
                            if(error) {
                                cb(null, error);
                                return;
                            }

                            if(!--unresolvedDepsCnt) {
                                var exports = [],
                                    i = 0, decl;
                                while(decl = decls[i++]) {
                                    exports.push(decl.exports);
                                }
                                cb(exports);
                            }
                        });
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else {
                    decl.dependents.push(cb);
                }

                if(decl.state === DECL_STATES.IN_RESOLVING) {
                    return;
                }

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

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
            this._overclockingTime = options.overclockingTime || 5000;
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
            var currentRotationAngel = 0;

            this._intervalRotationId = setInterval(function () {
                if (currentRotationAngel >= 360) {
                    currentRotationAngel -= (360 - _this._delta);
                } else {
                    currentRotationAngel += _this._delta;
                }
                node.css('transform', 'rotate(' + currentRotationAngel + 'deg)');
            }, this._repaintTimeout);
        }
    }, {
        getBlockName: function () {
            return 'turntable';
        }
    });

    provide(Turntable);
});

/**
 * Загружает (если нет на странице) и предоставляет jQuery.
 */

/* global jQuery */
modules.define(
    'jquery',
    ['load-script', 'jquery__config'],
    function (provide, loadScript, config) {

    if (typeof jQuery !== 'undefined') {
        provide(jQuery);
    } else {
        loadScript(config.url, function () {
            provide(jQuery);
        });
    }
});

/**
 * Загружает js-файлы добавляя тэг <script> в DOM.
 */
modules.define('load-script', function (provide) {
    var loading = {};
    var loaded = {};
    var head = document.getElementsByTagName('head')[0];

    /**
     * @param {String} path
     */
    function onLoad(path) {
        loaded[path] = true;
        var cbs = loading[path];
        delete loading[path];
        cbs.forEach(function (cb) {
            cb();
        });
    }

    /**
     * Загружает js-файл по переданному пути `path` и вызывает
     * колбэк `cb` по окончании загрузки.
     *
     * @name loadScript
     * @param {String} path
     * @param {Function} cb
     */
    provide(function (path, cb) {
        if (loaded[path]) {
            cb();
            return;
        }

        if (loading[path]) {
            loading[path].push(cb);
            return;
        }

        loading[path] = [cb];

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        // Добавляем `http:` к `//` если страница была открыта, используя `file://`-протокол.
        // Полезно для тестирования через PhantomJS, локальной отладки с внешними скриптами.
        script.src = (location.protocol === 'file:' && path.indexOf('//') === 0 ? 'http:' : '') + path;

        if (script.onreadystatechange === null) {
            script.onreadystatechange = function () {
                var readyState = this.readyState;
                if (readyState === 'loaded' || readyState === 'complete') {
                    script.onreadystatechange = null;
                    onLoad(path);
                }
            };
        } else {
            script.onload = script.onerror = function () {
                script.onload = script.onerror = null;
                onLoad(path);
            };
        }

        head.insertBefore(script, head.lastChild);
    });
});

modules.define('jquery__config', function (provide) {
    provide({
        url: '//yandex.st/jquery/1.11.1/jquery.min.js'
    });
});

modules.define(
    'block',
    [
        'inherit',
        'event-emitter',
        'event-manager',
        'block-event',
        'jquery',
        'vow',
        'bt',
        'extend'
    ],
    function (
        provide,
        inherit,
        EventEmitter,
        EventManager,
        BlockEvent,
        $,
        vow,
        bt,
        extend
    ) {

    var Block = inherit(EventEmitter, /** @lends Block.prototype */ {
        /**
         * Конструктор базового блока.
         * Его следует вызывать с помощью `this.__base` в наследующих классах.
         *
         * @constructor
         * @param {jQuery} [domNode] Элемент, на котором следует инициализировать блок.
         * @param {Object} [options] Опции блока. Содержит все декларированные опции BH-шаблона блока.
         *
         * @example
         * modules.define('control', ['block'], function (provide, Block) {
         *     var Control = inherit(Block, {
         *         __constructor: function () {
         *             this.__base.apply(this, arguments);
         *             // Дополнительные действия по инициализации
         *         }
         *     }, {
         *         getBlockName: function () {
         *             return 'control';
         *         }
         *     }));
         *
         *     provide(Control);
         * });
         */
        __constructor: function (domNode, options) {
            if (!domNode) {
                options = options || {};
                domNode = this._createDomElement(options);
            }

            // Если параметры не переданы, извлекаем их из DOM-ноды.
            if (!options) {
                options = this.__self._getDomNodeOptions(domNode).options || {};
            } else if (!options.__complete) {
                options = extend(options, this.__self._getDomNodeOptions(domNode).options || {});
            }

            // Store block instance link in jQuery data storage for this node.
            var nodeStorage = this.__self._getDomNodeDataStorage(domNode);
            nodeStorage.blocks[this.__self.getBlockName()] = this;

            this._options = options;
            this._node = domNode;
            this._eventManager = new EventManager(this);
            this._stateCache = null;
            this.__self._liveInitIfRequired();
            this._cachedViewName = null;
        },

        /**
         * Уничтожает блок. При уничтожении блок автоматически отвязывает все обработчики событий,
         * которые были привязаны к инстанции блока или привязаны внутри блока, используя метод `_bindTo()`.
         *
         * Этот метод следует перекрывать, если необходимы дополнительные действия при уничтожении блока.
         * При этом необходимо вызывать базовую реализацию деструктора с помощью `this.__base()`.
         *
         * @example
         * destruct: function () {
         *     this._cache.drop();
         *     this.__base();
         * }
         */
        destruct: function () {
            if (this._destructed) {
                return;
            }
            this.offAll();

            this._eventManager.unbindAll();
            this._eventManager = null;

            this._options = null;
            this._node = null;
            this._stateCache = null;
            this._destructed = true;
        },

        /**
         * Возвращает DOM-элемент данного блока.
         *
         * @returns {jQuery}
         */
        getDomNode: function () {
            return this._node;
        },

        /**
         * Добавляет обработчик события `event` объекта `emitter`. Контекстом обработчика
         * является экземпляр данного блока. Обработчик события автоматически удалится при вызове
         * `Block.prototype.destruct()`.
         *
         * @protected
         * @param {jQuery|Block} emitter
         * @param {String} event
         * @param {Function} callback
         * @returns {Block}
         *
         * @example
         * var View = inherit(Block, {
         *     __constructor: function (model) {
         *         this.__base();
         *
         *         var hide = this._findElement('hide');
         *         this._bindTo(hide, 'click', this._onHideClick);
         *
         *         this._bindTo(model, 'change-attr', this._onAttrChange);
         *     }
         * });
         */
        _bindTo: function (emitter, event, callback) {
            this._eventManager.bindTo(emitter, event, callback);
            return this;
        },

        /**
         * Удаляет обработчик события `event` объекта `emitter`, добавленный с помощью
         * `Block.prototype._bindTo()`.
         *
         * @protected
         * @param {jQuery|Block} emitter
         * @param {String} event
         * @param {Function} callback
         * @returns {Block}
         */
        _unbindFrom: function (emitter, event, callback) {
            this._eventManager.unbindFrom(emitter, event, callback);
            return this;
        },

        /**
         * Исполняет обработчики события `blockEvent` блока. Первым аргументом в обработчики события будет
         * передан экземпляр класса `BlockEvent`.
         *
         * @param {String|BlockEvent} blockEvent Имя события или экземпляр класса `BlockEvent`.
         * @param {Object} [data] Дополнительные данные, которые можно получить через `e.data` в обработчике.
         * @returns {Block}
         *
         * @example
         * var block = new Block();
         * block.on('click', function (e) {
         *     console.log(e.type);
         * });
         *
         * block.emit('click'); // => 'click'
         *
         * var event = new BlockEvent('click');
         * block.emit(event); // => 'click'
         */
        emit: function (blockEvent, data) {
            if (typeof blockEvent === 'string') {
                blockEvent = new BlockEvent(blockEvent);
            }

            blockEvent.data = data;
            blockEvent.target = this;

            this.__base(blockEvent.type, blockEvent);

            if (!blockEvent.isPropagationStopped()) {
                // Если событие блока надо распространять, кидаем специальное событие на DOM ноде блока.
                var jqEvent = $.Event(this.__self._getPropagationEventName(blockEvent.type));
                blockEvent._jqEvent = jqEvent;
                var domNode = this.getDomNode();
                if (domNode) {
                    this.getDomNode().trigger(jqEvent, blockEvent);
                }
            }

            return this;
        },

        /**
         * Возвращает имя отображения данного блока.
         *
         * @returns {String|undefined}
         */
        getView: function () {
            if (this._cachedViewName === null) {
                var cls = this.getDomNode().attr('class');
                if (cls) {
                    this._cachedViewName = cls.split(' ').shift().split('_')[1];
                } else {
                    this._cachedViewName = undefined;
                }
            }
            return this._cachedViewName;
        },

        /**
         * Устанавливает CSS-класс по имени и значению состояния.
         * Например, для блока `button` вызов `this._setState('pressed', 'yes')`
         * добавляет CSS-класс с именем `pressed_yes`.
         *
         * С точки зрения `BEM` похож на метод `setMod`, но не вызывает каких-либо событий.
         *
         * @protected
         * @param {String} stateName Имя состояния.
         * @param {String|Boolean} [stateVal=true] Значение.
         *                                         Если указан `false` или пустая строка, то CSS-класс удаляется.
         * @returns {Block}
         */
        _setState: function (stateName, stateVal) {
            if (arguments.length === 1) {
                stateVal = true;
            }
            stateVal = getStateValue(stateVal);
            var domElem = this.getDomNode();
            if (!this._stateCache) {
                this._stateCache = this._parseStateCssClasses(domElem);
            }
            var prevStateVal = this._stateCache[stateName] || false;
            if (stateVal !== prevStateVal) {
                this._stateCache[stateName] = stateVal;
                if (prevStateVal) {
                    domElem.removeClass('_' + stateName + (prevStateVal === true ? '' : '_' + prevStateVal));
                }
                if (stateVal) {
                    domElem.addClass('_' + stateName + (stateVal === true ? '' : '_' + stateVal));
                }
            }
            return this;
        },

        /**
         * Удаляет CSS-класс состояния с заданным именем.
         * Например, для блока `button` вызов `this._removeState('side')`
         * удалит CSS-классы с именами `side_left`, `side_right` и т.п.
         *
         * С точки зрения `BEM` похож на метод `delMod`, но не вызывает каких-либо событий.
         *
         * @protected
         * @param {String} stateName
         * @returns {Block}
         */
        _removeState: function (stateName) {
            return this._setState(stateName, false); // false удаляет состояние с указанным именем
        },

        /**
         * Возвращает значение состояния на основе CSS-классов блока.
         * Например, для блока `button`, у которого на DOM-элементе висит класс `pressed_yes`,
         * вызов `this._getState('pressed')` возвратит значение `yes`.
         *
         * С точки зрения `BEM` похож на метод `getMod`.
         *
         * @protected
         * @param {String} stateName
         * @returns {String|Boolean}
         */
        _getState: function (stateName) {
            if (!this._stateCache) {
                this._stateCache = this._parseStateCssClasses(this.getDomNode());
            }
            return this._stateCache[stateName] || false;
        },

        /**
         * Переключает значение состояния блока (полученное на основе CSS-классов) между двумя значениями.
         * Например, для блока `button`, у которого на DOM-элементе висит класс `pressed_yes`,
         * вызов `this._toggleState('pressed', 'yes', '')` удалит класс `pressed_yes`,
         * а повторный вызов — вернет на место.
         *
         * С точки зрения `BEM` похож на метод `toggleMod`, но не вызывает каких-либо событий.
         *
         * @protected
         * @param {String} stateName
         * @param {String|Boolean} stateVal1
         * @param {String|Boolean} stateVal2
         * @returns {Block}
         */
        _toggleState: function (stateName, stateVal1, stateVal2) {
            stateVal1 = getStateValue(stateVal1);
            stateVal2 = getStateValue(stateVal2);
            var currentModVal = this._getState(stateName);
            if (currentModVal === stateVal1) {
                this._setState(stateName, stateVal2);
            } else if (currentModVal === stateVal2) {
                this._setState(stateName, stateVal1);
            }
            return this;
        },

        /**
         * Устанавливает CSS-класс для элемента по имени и значению состояния.
         * Например, для элемента `text` блока `button` вызов
         * `this._setElementState(this._findElement('text'), 'pressed', 'yes')`
         * добавляет CSS-класс с именем `pressed_yes`.
         *
         * С точки зрения `BEM` похож на метод `setElemMod`.
         *
         * @protected
         * @param {HTMLElement|jQuery} domNode
         * @param {String} stateName Имя состояния.
         * @param {String|Boolean} [stateVal=true] Значение.
         *                                         Если указан `false` или пустая строка, то CSS-класс удаляется.
         * @returns {Block}
         */
        _setElementState: function (domNode, stateName, stateVal) {
            if (domNode) {
                domNode = $(domNode);
                if (arguments.length === 2) {
                    stateVal = true;
                }
                stateVal = getStateValue(stateVal);
                var parsedMods = this._parseStateCssClasses(domNode);
                var prevModVal = parsedMods[stateName];
                if (prevModVal) {
                    domNode.removeClass('_' + stateName + (prevModVal === true ? '' : '_' + prevModVal));
                }
                if (stateVal) {
                    domNode.addClass('_' + stateName + (stateVal === true ? '' : '_' + stateVal));
                }
            } else {
                throw new Error('`domNode` should be specified for `_setElementState` method.');
            }
            return this;
        },

        /**
         * Удаляет CSS-класс состояния с заданным именем для элемента.
         * Например, для элемента `text` блока `button` вызов
         * `this._removeElementState(this._findElement('text'), 'side')`
         * удалит CSS-классы с именами `side_left`, `side_right` и т.п.
         *
         * С точки зрения `BEM` похож на метод `delElemMod`.
         *
         * @protected
         * @param {HTMLElement|jQuery} domNode
         * @param {String} stateName
         * @returns {Block}
         */
        _removeElementState: function (domNode, stateName) {
            // false удаляет состояние с указанным именем
            return this._setElementState(domNode, stateName, false);
        },

        /**
         * Возвращает значение состояния на основе CSS-классов элемента.
         * Например, для элемента `text` блока `button`,
         * у которого на DOM-элементе висит класс `pressed_yes`, вызов
         * `this._getElementState(this._findElement('text'), 'pressed')` возвратит значение `yes`.
         *
         * С точки зрения `BEM` похож на метод `getElemMod`.
         *
         * @protected
         * @param {HTMLElement|jQuery} domNode
         * @param {String} stateName
         * @returns {String}
         */
        _getElementState: function (domNode, stateName) {
            if (domNode) {
                domNode = $(domNode);
                var elemName = this._getElementName(domNode);
                if (elemName) {
                    return this._parseStateCssClasses(domNode)[stateName] || false;
                } else {
                    throw new Error('Unable to get BEM Element name from DOM Node.');
                }
            } else {
                throw new Error('`domNode` should be specified for `_getElementState` method.');
            }
        },

        /**
         * Переключает значение состояния элемента блока (полученное на основе CSS-классов) между двумя значениями.
         * Например, для элемента `text` блока `button`,
         * у которого на DOM-элементе висит класс `pressed_yes`, вызов
         * `this._toggleElementState(this._findElement('text'), 'pressed', 'yes', '')`
         * удалит класс `pressed_yes`, а повторный вызов — вернет на место.
         *
         * С точки зрения `BEM` похож на метод `toggleElemMod`.
         *
         * @protected
         * @param {HTMLElement|jQuery} domNode
         * @param {String} stateName
         * @param {String} stateVal1
         * @param {String} stateVal2
         * @returns {Block}
         */
        _toggleElementState: function (domNode, stateName, stateVal1, stateVal2) {
            stateVal1 = getStateValue(stateVal1);
            stateVal2 = getStateValue(stateVal2);
            var currentModVal = this._getElementState(domNode, stateName);
            if (currentModVal === stateVal1) {
                this._setElementState(domNode, stateName, stateVal2);
            } else if (currentModVal === stateVal2) {
                this._setElementState(domNode, stateName, stateVal1);
            }
            return this;
        },

        /**
         * Возвращает первый элемент с указанным именем.
         *
         * @protected
         * @param {String} elementName Имя элемента.
         * @param {HTMLElement|jQuery} [parentElement] Элемент в котором необходимо произвести поиск. Если не указан,
         *                                             то используется результат `this.getDomNode()`.
         * @returns {jQuery|undefined}
         *
         * @example
         * var title = this._findElement('title');
         * title.text('Hello World');
         */
        _findElement: function (elementName, parentElement) {
            return this._findAllElements(elementName, parentElement)[0];
        },

        /**
         * Возвращает все элементы по указанному имени.
         *
         * @protected
         * @param {String} elementName Имя элемента.
         * @param {HTMLElement|jQuery} [parentElement] Элемент в котором необходимо произвести поиск. Если не указан,
         *                                             то используется результат `this.getDomNode()`.
         * @returns {jQuery[]}
         *
         * @example
         * this._findAllElements('item').forEach(function (item) {
         *     item.text('Item');
         * });
         */
        _findAllElements: function (elementName, parentElement) {
            parentElement = parentElement ? $(parentElement) : this.getDomNode();
            var view = this.getView();
            var elems = parentElement.find(
                '.' + this.__self.getBlockName() + (view ? '_' + view : '') + '__' + elementName
            );
            var result = [];
            var l = elems.length;
            for (var i = 0; i < l; i++) {
                result.push($(elems[i]));
            }
            return result;
        },

        /**
         * Возвращает параметры, которые были переданы блоку при инициализации.
         *
         * @protected
         * @returns {Object}
         *
         * @example
         * var control = Control.fromDomNode(
         *     $('<div class="control _init" onclick="return {\'control\':{level:5}}"></div>')
         * );
         * // control:
         * inherit(Block, {
         *     myMethod: function() {
         *         console.log(this._getOptions().level);
         *     }
         * }, {
         *     getBlockName: function() {
         *         return 'control';
         *     }
         * });
         */
        _getOptions: function () {
            return this._options;
        },

        /**
         * Возвращает параметры, которые были переданы элементу блока при инициализации.
         *
         * @protected
         * @param {HTMLElement|jQuery} domNode
         * @returns {Object}
         *
         * @example
         * // HTML:
         * // <div class="control _init">
         * //     <div class="control__text" data-options="{options:{level:5}}"></div>
         * // </div>
         *
         * provide(inherit(Block, {
         *     __constructor: function() {
         *         this.__base.apply(this, arguments);
         *         this._textParams = this._getElementOptions(this._findElement('text'));
         *     }
         * }, { getBlockName: function() { return 'control'; } }));
         */
        _getElementOptions: function (domNode) {
            if (domNode) {
                domNode = $(domNode);
                var elemName = this._getElementName(domNode);
                if (elemName) {
                    return this.__self._getDomNodeOptions(domNode).options || {};
                } else {
                    throw new Error('Unable to get BEM Element name from DOM Node.');
                }
            } else {
                throw new Error('`domNode` should be specified for `_getElementOptions` method.');
            }
        },

        /**
         * Создает и возвращает DOM-элемент на основе BH-опций.
         * Создание нового элемента осуществляется с помощью применения BH-шаблонов.
         *
         * @protected
         * @param {Object} params
         * @returns {jQuery}
         */
        _createDomElement: function (params) {
            return $(bt.apply(extend({}, params, {block: this.__self.getBlockName()})));
        },

        /**
         * Разбирает состояния DOM-элемента, возвращает объект вида `{stateName: stateVal, ...}`.
         *
         * @private
         * @param {jQuery} domNode
         * @returns {Object}
         */
        _parseStateCssClasses: function (domNode) {
            var result = {};
            var classAttr = domNode.attr('class');
            if (classAttr) {
                var classNames = classAttr.split(' ');
                for (var i = classNames.length - 1; i >= 0; i--) {
                    if (classNames[i].charAt(0) === '_') {
                        var classNameParts = classNames[i].substr(1).split('_');
                        if (classNameParts.length === 2) {
                            result[classNameParts[0]] = classNameParts[1];
                        } else {
                            result[classNameParts[0]] = true;
                        }
                    }
                }
            }
            return result;
        },

        /**
         * Возвращает имя элемента блока на основе DOM-элемента.
         *
         * @private
         * @param {jQuery} domNode
         * @returns {String|null}
         */
        _getElementName: function (domNode) {
            var view = this.getView();
            var match = (domNode[0].className || '').match(
                new RegExp(this.__self.getBlockName() + (view ? '_' + view : '') + '__([a-zA-Z0-9-]+)(?:\\s|$)')
            );
            return match ? match[1] : null;
        }
    }, {
        /**
         * Возвращает имя блока.
         * Этот метод следует перекрывать при создании новых блоков.
         *
         * @static
         * @returns {String|null}
         *
         * @example
         * provide(inherit(Block, {}, {
         *     getBlockName: function() {
         *         return 'my-button';
         *     }
         * });
         */
        getBlockName: function () {
            return 'block';
        },

        /**
         * Возвращает инстанцию блока для переданного DOM-элемента.
         *
         * @static
         * @param {HTMLElement|jQuery} domNode
         * @param {Object} [params]
         * @returns {Block}
         *
         * @example
         * var page = Page.fromDomNode(document.body);
         */
        fromDomNode: function (domNode, params) {
            if (!domNode) {
                throw new Error('`domNode` should be specified for `findDomNode` method');
            }
            var blockName = this.getBlockName();
            domNode = $(domNode);
            if (!domNode.length) {
                throw new Error('Cannot initialize "' + blockName + '" from empty jQuery object');
            }
            var nodeStorage = this._getDomNodeDataStorage(domNode);
            var instance = nodeStorage.blocks[blockName];
            if (!instance) {
                domNode.addClass(this._autoInitCssClass);
                if (params === undefined) {
                    params = this._getDomNodeOptions(domNode).options || {};
                }
                params.__complete = true;
                var BlockClass = this;
                instance = new BlockClass(domNode, params);
            }
            return instance;
        },

        /**
         * Инициализирует блок, если это необходимо.
         * Возвращает `null` для блоков с отложенной (`live`) инициализацией и инстанцию блока для прочих.
         *
         * @static
         * @param {HTMLElement|jQuery} domNode
         * @param {Object} params
         * @returns {Block|null}
         */
        initOnDomNode: function (domNode, params) {
            var initBlock;
            if (this._liveInit) {
                this._liveInitIfRequired();
                initBlock = false;
                if (this._instantInitHandlers) {
                    for (var i = 0, l = this._instantInitHandlers.length; i < l; i++) {
                        if (this._instantInitHandlers[i](params, domNode)) {
                            initBlock = true;
                            break;
                        }
                    }
                }
            } else {
                initBlock = true;
            }
            if (initBlock) {
                domNode = $(domNode);
                return this.fromDomNode(domNode, params);
            } else {
                return null;
            }
        },

        /**
         * Запускает `live`-инициализацию, если она определена для блока и не была выполнена ранее.
         *
         * @static
         * @protected
         */
        _liveInitIfRequired: function () {
            var blockName = this.getBlockName();
            if (this._liveInit && (!this._liveInitialized || !this._liveInitialized[blockName])) {
                this._liveInit();
                (this._liveInitialized = this._liveInitialized || {})[blockName] = true;
            }
        },

        /**
         * Если для блока требуется отложенная (`live`) инициализация,
         * следует перекрыть это свойство статическим методом.
         *
         * Этот выполняется лишь однажды, при инициализации первого блока на странице.
         *
         * В рамках `_liveInit` можно пользоваться методами `_liveBind` и `_liveBindToElement` для того,
         * чтобы глобально слушать события на блоке и элементе соответственно.
         *
         * @static
         * @protected
         * @type {Function|null}
         *
         * @example
         * var MyBlock = inherit(Block, {}, {
         *     _liveInit: function () {
         *         this._liveBind('click', function(e) {
         *             this._setState('clicked', 'yes');
         *         });
         *         this._liveBindToElement('title', 'click', function(e) {
         *             this._setElementState($(e.currentTarget), 'clicked', 'yes');
         *         });
         *     }
         * });
         */
        _liveInit: null,

        /**
         * Отменяет отложенную инициализацию блока по определенному условию.
         * Условием служит функция, которая принимает параметры и DOM-элемент блока. Если функция возвращает true,
         * то блок инициализируется сразу.
         * Рекомендуется для таких случаев передавать нужные параметры, которые сигнализируют о том,
         * что блок необходимо инициализировать блок сразу.
         *
         * @static
         * @protected
         * @param {Function<Object,jQuery>} condition
         */
        _instantInitIf: function (condition) {
            if (!this._instantInitHandlers) {
                this._instantInitHandlers = [];
            }
            this._instantInitHandlers.push(condition);
        },

        /**
         * Глобально слушает событие на блоке. Используется при отложенной инициализации.
         * Обработчик события выполнится в контексте инстанции блока.
         *
         * @static
         * @protected
         * @param {String} eventName
         * @param {Function} handler
         */
        _liveBind: function (eventName, handler) {
            var blockClass = this;
            this._getLiveEventsScopeElement().on(eventName, '[data-block="' + this.getBlockName() + '"]', function (e) {
                handler.call(blockClass.fromDomNode(e.currentTarget), e);
            });
        },

        /**
         * Глобально слушает событие на элементе блока. Используется при отложенной инициализации.
         * Обработчик события выполнится в контексте инстанции блока.
         *
         * @static
         * @protected
         * @param {String} elementName
         * @param {String} eventName
         * @param {Function} handler
         */
        _liveBindToElement: function (elementName, eventName, handler) {
            var blockClass = this;
            var blockName = this.getBlockName();
            var selectors = [
                '[class^="' + blockName + '_"][class$="__' + elementName + '"]',
                '[class^="' + blockName + '_"][class*="__' + elementName + ' "]'
            ];
            this._getLiveEventsScopeElement().on(
                eventName,
                selectors.join(', '),
                function (e) {
                    handler.call(
                        blockClass.fromDomNode($(e.currentTarget).closest('[data-block="' + blockName + '"]')),
                        e
                    );
                }
            );
        },

        /**
         * Возвращает элемент, на котором будут слушаться глобальные (`live`) события.
         *
         * @static
         * @protected
         * @returns {jQuery}
         */
        _getLiveEventsScopeElement: function () {
            return $(document.body);
        },

        /**
         * Уничтожает инстанцию блока на переданном DOM-элементе.
         *
         * @static
         * @param {HTMLElement|jQuery} domNode
         */
        destructOnDomNode: function (domNode) {
            domNode = $(domNode);
            var blockName = this.getBlockName();
            var nodeStorage = this._getDomNodeDataStorage(domNode, true);
            if (nodeStorage && nodeStorage.blocks[blockName]) {
                var instance = nodeStorage.blocks[blockName];
                if (!instance._destructed) {
                    instance.destruct();
                }
                delete nodeStorage.blocks[blockName];
            }
        },

        /**
         * Возвращает первую инстанцию блока внутри переданного фрагмента DOM-дерева.
         *
         * @static
         * @param {jQuery|HTMLElement|Block} parentElement
         * @returns {Block|undefined}
         *
         * @example
         * var input = Input.find(document.body);
         * if (input) {
         *     input.setValue('Hello World');
         * } else {
         *     throw new Error('Input wasn\'t found in "control".');
         * }
         */
        find: function (parentElement) {
            return this.findAll(parentElement)[0];
        },

        /**
         * Возвращает все инстанции блока внутри переданного фрагмента DOM-дерева.
         *
         * @static
         * @param {jQuery|HTMLElement|Block} parentElement
         * @returns {Block[]}
         *
         * @example
         * var inputs = Input.findAll(document.body);
         * inputs.forEach(function (input) {
         *     input.setValue("Input here");
         * });
         */
        findAll: function (parentElement) {
            if (!parentElement) {
                throw new Error('`parentElement` should be specified for `findAll` method');
            }

            parentElement = this._getDomNodeFrom(parentElement);

            var domNodes = parentElement.find('[data-block=' + this.getBlockName() + ']');
            if (domNodes.length) {
                var result = [];
                var l = domNodes.length;
                for (var i = 0; i < l; i++) {
                    var domNode = $(domNodes[i]);
                    result.push(this.fromDomNode(domNode));
                }
                return result;
            } else {
                return [];
            }
        },

        /**
         * Инициализирует все блоки на переданном фрагменте DOM-дерева.
         *
         * @static
         * @param {HTMLElement|jQuery|Block} domNode
         * @returns {Promise}
         *
         * @example
         * Block.initDomTree(document.body).done(function () {
         *     Button.getEmitter(document.body).on('click', function () {
         *         alert("Button is clicked");
         *     });
         * });
         */
        initDomTree: function (domNode) {
            if (!domNode) {
                throw new Error('`domNode` should be specified for `initDomTree` method');
            }
            domNode = this._getDomNodeFrom(domNode);
            var selector = '.' + this._autoInitCssClass;
            var classesToLoad = {};
            var nodes = domNode.find(selector);

            if (domNode.is(selector)) {
                Array.prototype.unshift.call(nodes, domNode);
            }
            var tasks = [];

            var l = nodes.length;
            for (var i = 0; i < l; i++) {
                var node = $(nodes[i]);
                var params = this._getDomNodeOptions(node) || {};

                var blockName = node.attr('data-block');
                if (blockName) {
                    tasks.push({
                        node: node,
                        className: blockName,
                        options: params.options || {},
                        isMixin: false
                    });
                    classesToLoad[blockName] = null;
                    var mixins = params.mixins;
                    if (mixins) {
                        for (var j = 0, jl = mixins.length; j < jl; j++) {
                            var mixinData = mixins[j];
                            if (mixinData && mixinData.name) {
                                tasks.push({
                                    node: node,
                                    className: mixinData.name,
                                    blockName: blockName,
                                    options: mixinData,
                                    isMixin: true
                                });
                                classesToLoad[mixinData.name] = null;
                            }
                        }
                    }
                }
            }

            function loadModule(moduleName) {
                var promise = vow.promise();
                if (modules.isDefined(moduleName)) {
                    modules.require([moduleName], function (moduleClass) {
                        classesToLoad[moduleName] = moduleClass;
                        promise.fulfill();
                    });
                    return promise;
                } else {
                    return null;
                }
            }

            return vow.fulfill().then(function () {
                return vow.all(Object.keys(classesToLoad).map(function (className) {
                    return loadModule(className);
                })).then(function () {
                    var l = tasks.length;
                    for (var i = 0; i < l; i++) {
                        var task = tasks[i];
                        var node = task.node;
                        var className = task.className;
                        var options = task.options;
                        var classDef = classesToLoad[className];
                        if (classDef) {
                            try {
                                if (task.isMixin) {
                                    var blockClass = classesToLoad[task.blockName];
                                    if (blockClass) {
                                        classDef.fromBlock(blockClass.fromDomNode(node), options);
                                    }
                                } else {
                                    classDef.initOnDomNode(node, options);
                                }
                            } catch (e) {
                                e.message = className + ' init error: ' + e.message;
                                throw e;
                            }
                        }
                    }
                });
            });
        },

        /**
         * Уничтожает все инстанции блоков на переданном фрагменте DOM-дерева.
         *
         * @static
         * @param {HTMLElement|jQuery|Block} domNode
         */
        destructDomTree: function (domNode) {
            if (!domNode) {
                throw new Error('`domNode` should be specified for `destructDomTree` method');
            }
            domNode = this._getDomNodeFrom(domNode);

            var selector = '.' + this._autoInitCssClass + ',.' + this._delegateEventsCssClass;
            var nodes = domNode.find(selector);

            if (domNode.is(selector)) {
                Array.prototype.unshift.call(nodes, domNode);
            }

            for (var i = 0; i < nodes.length; i++) {
                var node = $(nodes[i]);
                var nodeStorage = this._getDomNodeDataStorage(node, true);
                if (nodeStorage) {
                    var blocks = nodeStorage.blocks;
                    for (var blockName in blocks) {
                        if (blocks.hasOwnProperty(blockName)) {
                            blocks[blockName].__self.destructOnDomNode(node);
                        }
                    }
                    nodeStorage.blocks = {};
                    var blockEvents = nodeStorage.blockEvents;
                    for (blockName in blockEvents) {
                        if (blockEvents.hasOwnProperty(blockName)) {
                            blockEvents[blockName].offAll();
                        }
                    }
                    nodeStorage.blockEvents = {};
                }
            }
        },

        /**
         * Возвращает эмиттер событий блока для переданного DOM-элемента.
         * На полученном эмиттере можно слушать блочные события, которые будут всплывать до этого DOM-элемента.
         *
         * @static
         * @param {HTMLElement|jQuery|Block} domNode
         * @returns {EventEmitter}
         *
         * @example
         * Button.getEmitter(document.body).on('click', function () {
         *     alert('Button is clicked');
         * });
         */
        getEmitter: function (domNode) {
            domNode = this._getDomNodeFrom(domNode);

            var nodeStorage = this._getDomNodeDataStorage(domNode);
            var blockName = this.getBlockName();
            var emitter = nodeStorage.blockEvents[blockName];

            if (!emitter) {
                domNode.addClass(this._delegateEventsCssClass);
                emitter = new BlockEventEmitter(this, domNode);
                nodeStorage.blockEvents[blockName] = emitter;
            }

            return emitter;
        },

        /**
         * Возвращает jQuery DOM-элемент используя HTMLElement, инстанцию блока или другой jQuery-элемент.
         *
         * @static
         * @protected
         * @param {jQuery|HTMLElement|Block} domNode
         * @returns {Block}
         */
        _getDomNodeFrom: function (domNode) {
            if (domNode) {
                if (domNode instanceof Block) {
                    domNode = domNode.getDomNode();
                }
                domNode = $(domNode);
            } else {
                throw new Error('jQuery element, DOM Element or Block instance should be specified');
            }
            return domNode;
        },

        /**
         * Возвращает опции блока или элемента на указанном DOM-элементе.
         *
         * @static
         * @private
         * @param {jQuery} domNode
         */
        _getDomNodeOptions: function (domNode) {
            var options = domNode.attr('data-options');
            return options ? JSON.parse(options) : {};
        },

        /**
         * Возвращает хранилище данных для DOM-элемента.
         *
         * @static
         * @private
         * @param {jQuery} domNode
         * @param {Boolean} [skipCreating]
         * @returns {Object}
         */
        _getDomNodeDataStorage: function (domNode, skipCreating) {
            var data = domNode.data('block-storage');
            if (!data && !skipCreating) {
                data = {
                    blocks: {},
                    blockEvents: {}
                };
                domNode.data('block-storage', data);
            }
            return data;
        },

        /**
         * Возвращает специальное имя события, которое используется для распространения события блока по DOM дереву.
         *
         * @static
         * @private
         * @param {String} eventName Имя события блока.
         * @returns {String}
         */
        _getPropagationEventName: function (eventName) {
            return 'block/' + this.getBlockName() + '/' + eventName;
        },

        /**
         * CSS-класс для автоматической инициализации.
         *
         * @static
         * @private
         * @type {String}
         */
        _autoInitCssClass: '_init',

        /**
         * CSS-класс для делегирования событий.
         *
         * @static
         * @private
         * @type {String}
         */
        _delegateEventsCssClass: '_live-events'
    });

    /**
     * Эмиттер, используемый для делегирования событий блока.
     *
     * Делегирование событий блока происходит следующим образом:
     * - Когда блок инициирует событие `eventName`, он также инциирует событие `block/blockName/eventName`
     *   на DOM ноде блока. Это событие распространяется вверх по DOM дереву.
     *
     * - При добавлении нового события в `BlockEventEmitter`, для переданной DOM ноды добавляется обработчик события
     *   `block/blockName/eventName`, который инициирует в эмиттере событие `eventName`.
     *
     * - При удалении события из `BlockEventEmitter`, соответствующий обработчик удаляется из DOM ноды. Тем самым
     *   прекращается делегирование.
     */
    var BlockEventEmitter = inherit(EventEmitter, {
        /**
         * Создает эмиттер событий, который позволяет слушать события экземпляров блока `blockClass`
         * на DOM ноде `domNode`.
         *
         * @param {Function} blockClass
         * @param {jQuery} domNode
         */
        __constructor: function (blockClass, domNode) {
            this._blockClass = blockClass;
            this._domNode = domNode;
            this._listeners = {};
        },

        _onAddEvent: function (eventName) {
            var _this = this;
            function listener(jqEvent, blockEvent) {
                _this.emit(eventName, blockEvent);
                if (blockEvent.isPropagationStopped()) {
                    jqEvent.stopPropagation();
                }
            }

            var propagationEventName = this._blockClass._getPropagationEventName(eventName);
            this._domNode.on(propagationEventName, listener);
            this._listeners[eventName] = listener;
        },

        _onRemoveEvent: function (eventName) {
            var propagationEventName = this._blockClass._getPropagationEventName(eventName);
            this._domNode.off(propagationEventName, this._listeners[eventName]);
            delete this._listeners[eventName];
        }
    });

    function getStateValue(stateVal) {
        if (typeof stateVal === 'string') {
            if (stateVal === '') {
                stateVal = false;
            }
        } else {
            if (typeof stateVal === 'number') {
                stateVal = String(stateVal);
            } else {
                stateVal = Boolean(stateVal);
            }
        }
        return stateVal;
    }

    provide(Block);
});

/**
 * Inheritance module
 *
 * Copyright (c) 2010-2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 2.0.3
 */

modules.define('inherit', function(provide) {

var hasIntrospection = (function(){'_';}).toString().indexOf('_') > -1,
    emptyBase = function() {},
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            o2.hasOwnProperty(i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    noOp = function() {},
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // fucking ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }
    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        name = addList[j++];
        prop = add[name];
        if(isFunction(prop) &&
                (!hasIntrospection || prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name] || noOp;
                return function() {
                    var baseSaved = this.__base;
                    this.__base = baseMethod;
                    var res = prop.apply(this, arguments);
                    this.__base = baseSaved;
                    return res;
                };
            })(name, prop);
        }
        else {
            res[name] = prop;
        }
    }
}

/**
 * Создает и возвращает новый класс на основе базового класса (если указан),
 * набора инстанс-методов и набора статических методов.
 *
 * @name inherit
 * @param {Function} [baseClass] Класс, от которого наследуемся.
 * @param {Object} instanceMethods Инстанс-методы.
 * @param {Object} [staticMethods] Статические методы.
 * @returns {Function}
 *
 * @example
 * var YButton = inherit(YBlock, {
 *     __constructor: function () {
 *         this.__base.apply(this, arguments);
 *         this._bindTo(this.getDomNode(), 'click', function() {
 *             this.emit('click');
 *         });
 *     }
 * }, {
 *     getBlockName: function () {
 *         return 'y-button';
 *     }
 * });
 */

var inherit = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? args[0][0] : args[0] : emptyBase,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    var basePtp = base.prototype,
        resultPtp = res.prototype = objCreate(basePtp);

    resultPtp.__self = resultPtp.constructor = res;

    props && override(basePtp, resultPtp, props);
    staticProps && override(base, res, staticProps);

    if(withMixins) {
        var i = 1, mixins = args[0], mixin,
            propList, propName, j, len;
        while(mixin = mixins[i++]) {
            if(isFunction(mixin)) {
                extend(res, mixin);
                mixin = mixin.prototype;
            }

            propList = getPropList(mixin);
            j = 0; len = propList.length;
            while(j < len) {
                propName = propList[j++];
                if(propName !== '__self' && propName !== '__constructor' && propName !== 'constructor') {
                    resultPtp[propName] = mixin[propName];
                }
            }
        }
    }

    return res;
};

inherit.self = function(base, props, staticProps) {
    var basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);

    return base;
};

provide(inherit);

});

modules.define(
    'event-emitter',
    ['inherit'],
    function (provide, inherit) {

    var slice = Array.prototype.slice;

    /**
     * @name EventEmitter
     */
    var EventEmitter = inherit({
        /**
         * Добавляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {EventEmitter}
         */
        on: function (event, callback, context) {
            if (!this._events) {
                this._events = {};
            }

            var listener = {
                callback: callback,
                context: context
            };

            var listeners = this._events[event];
            if (listeners) {
                listeners.push(listener);
            } else {
                this._events[event] = [listener];
                this._onAddEvent(event);
            }

            return this;
        },

        /**
         * Добавляет обработчик события, который исполнится только 1 раз, затем удалится.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @return {EventEmitter}
         */
        once: function (event, callback, context) {
            var self = this;

            function once() {
                self.off(event, once, context);
                callback.apply(context, arguments);
            }

            // Сохраняем ссылку на оригинальный колбэк. Благодаря этому можно удалить колбэк `once`,
            // используя оригинальный колбэк в методе `off()`.
            once._callback = callback;

            this.on(event, once, context);
            return this;
        },

        /**
         * Удаляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {EventEmitter}
         */
        off: function (event, callback, context) {
            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            var len = listeners.length;
            for (var i = 0; i < len; i++) {
                var listener = listeners[i];
                var cb = listener.callback;
                if ((cb === callback || cb._callback === callback) && listener.context === context) {
                    if (len === 1) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    } else {
                        listeners.splice(i, 1);
                    }
                    break;
                }
            }

            return this;
        },

        /**
         * Удаляет все обработчики всех событий или все обработчики переданного события `event`.
         *
         * @param {String} [event]
         * @returns {EventEmitter}
         */
        offAll: function (event) {
            if (this._events) {
                if (event) {
                    if (this._events[event]) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    }
                } else {
                    for (event in this._events) {
                        if (this._events.hasOwnProperty(event)) {
                            this._onRemoveEvent(event);
                        }
                    }
                    delete this._events;
                }
            }
            return this;
        },

        /**
         * Исполняет все обработчики события `event`.
         *
         * @param {String} event
         * @param {*} [...] Аргументы, которые будут переданы в обработчики события.
         * @returns {EventEmitter}
         */
        emit: function (event) {
            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            // Копируем массив обработчиков, чтобы добавление/удаление обработчиков внутри колбэков не оказывало
            // влияния в цикле.
            var listenersCopy = listeners.slice(0);
            var len = listenersCopy.length;
            var listener;
            var i = -1;

            switch (arguments.length) {
                // Оптимизируем наиболее частые случаи.
                case 1:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context);
                    }
                    break;
                case 2:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1]);
                    }
                    break;
                case 3:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1], arguments[2]);
                    }
                    break;
                default:
                    var args = slice.call(arguments, 1);
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.apply(listener.context, args);
                    }
            }

            return this;
        },

        /**
         * Вызывается когда было добавлено новое событие.
         *
         * @protected
         * @param {String} event
         */
        _onAddEvent: function () {},

        /**
         * Вызывается когда все обработчики события были удалены.
         *
         * @protected
         * @param {String} event
         */
        _onRemoveEvent: function () {}
    });

    provide(EventEmitter);
});

modules.define(
    'event-manager',
    [
        'inherit',
        'event-emitter',
        'jquery'
    ],
    function (
        provide,
        inherit,
        EventEmitter,
        $
    ) {

    /**
     * Адаптер для EventEmitter, jQuery. Позволяет привязывать обработчики к разным эмиттерам событий
     * и отвязывать их, используя вызов одной функции. Менеджер всегда привязан к какому-либо объекту, который
     * является контекстом для всех обработчиков.
     *
     * Полезен, когда нужно отвязать все обработчики сразу. Например, при уничтожении объекта.
     *
     * @example
     * function UserView(model, el) {
     *     this._eventManager = new EventManager(this);
     *
     *     // Привязываем обработчик к EventEmitter
     *     this._eventManager.bindTo(model, 'change-name', this._changeName);
     *
     *     // Привязываем обработчик к jQuery объекту
     *     var hideEl = el.find('.hide');
     *     this._eventManager.bindTo(hideEl, 'click', this._hide);
     * }
     *
     * UserView.prototype.destruct = function () {
     *     // Удаляем все обработчики
     *     this._eventManager.unbindAll();
     * };
     *
     * UserView.prototype._changeName = function () {};
     *
     * UserView.prototype._hide = function () {};
     */
    var EventManager = inherit({
        /**
         * Создает менджер событий для переданного объекта.
         *
         * @param {Object} owner Контекст для всех обработчиков событий.
         */
        __constructor: function (owner) {
            this._owner = owner;
            this._listeners = [];
        },

        /**
         * Привязывает обработчик к переданному эмиттеру событий.
         *
         * @param {EventEmitter|jQuery} emitter
         * @param {String} event
         * @param {Function} callback
         * @returns {EventManager}
         */
        bindTo: function (emitter, event, callback) {
            if (emitter instanceof EventEmitter) {
                this._listeners.push({
                    type: 'islets',
                    emitter: emitter.on(event, callback, this._owner),
                    event: event,
                    callback: callback
                });
            } else if (emitter instanceof $) {
                var proxy = callback.bind(this._owner);
                this._listeners.push({
                    type: 'jquery',
                    emitter: emitter.on(event, proxy),
                    event: event,
                    callback: callback,
                    proxy: proxy
                });
            } else {
                throw new Error('Unsupported emitter type');
            }
            return this;
        },

        /**
         * Отвязывает обработчик от переданного эмиттера событий.
         *
         * @param {EventEmitter|jQuery} emitter
         * @param {String} event
         * @param {Function} callback
         * @returns {EventManager}
         */
        unbindFrom: function (emitter, event, callback) {
            for (var i = 0; i < this._listeners.length; i++) {
                var listener = this._listeners[i];
                if (listener.emitter === emitter &&
                    listener.event === event &&
                    listener.callback === callback
                ) {
                    this._unbind(listener);
                    this._listeners.splice(i, 1);
                    break;
                }
            }
            return this;
        },

        /**
         * Отвязывает все обработчики от всех эмиттеров событий.
         *
         * @returns {EventManager}
         */
        unbindAll: function () {
            while (this._listeners.length) {
                var listener = this._listeners.pop();
                this._unbind(listener);
            }
            return this;
        },

        /**
         * Отвязывает обработчик события.
         *
         * @private
         * @param {Object} listener
         */
        _unbind: function (listener) {
            switch (listener.type) {
                case 'islets':
                    listener.emitter.off(listener.event, listener.callback, this._owner);
                    break;
                case 'jquery':
                    listener.emitter.off(listener.event, listener.proxy);
            }
        }
    });

    provide(EventManager);
});

modules.define(
    'block-event',
    [
        'inherit'
    ],
    function (
        provide,
        inherit
    ) {

    /**
     * Класс, представляющий событие блока.
     */
    var BlockEvent = inherit({
        /**
         * @param {String} type Тип события.
         * @param {Boolean} [isPropagationStopped=false] Запрещает распространение события.
         * @param {Boolean} [isDefaultPrevented=false] Запрещает действие по умолчанию.
         */
        __constructor: function (type, isPropagationStopped, isDefaultPrevented) {
            this.type = type;
            this._isPropagationStopped = Boolean(isPropagationStopped);
            this._isDefaultPrevented = Boolean(isDefaultPrevented);
        },

        /**
         * Определяет, прекращено ли распространение события.
         *
         * @returns {Boolean}
         */
        isPropagationStopped: function () {
            return this._isPropagationStopped;
        },

        /**
         * Проверяет, отменена ли реакция по умолчанию на событие.
         *
         * @returns {Boolean}
         */
        isDefaultPrevented: function () {
            return this._isDefaultPrevented;
        },

        /**
         * Прекращает распространение события.
         */
        stopPropagation: function () {
            this._isPropagationStopped = true;
        },

        /**
         * Отменяет реакцию по умолчанию на событие.
         */
        preventDefault: function () {
            this._isDefaultPrevented = true;
        }
    });

    provide(BlockEvent);
});

/**
 * Vow
 *
 * Copyright (c) 2012-2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.3.9
 */

(function(global) {

var Promise = function(val) {
    this._res = val;

    this._isFulfilled = !!arguments.length;
    this._isRejected = false;

    this._fulfilledCallbacks = [];
    this._rejectedCallbacks = [];
    this._progressCallbacks = [];
};

Promise.prototype = {
    valueOf : function() {
        return this._res;
    },

    isFulfilled : function() {
        return this._isFulfilled;
    },

    isRejected : function() {
        return this._isRejected;
    },

    isResolved : function() {
        return this._isFulfilled || this._isRejected;
    },

    fulfill : function(val) {
        if(this.isResolved()) {
            return;
        }

        this._isFulfilled = true;
        this._res = val;

        this._callCallbacks(this._fulfilledCallbacks, val);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    reject : function(err) {
        if(this.isResolved()) {
            return;
        }

        this._isRejected = true;
        this._res = err;

        this._callCallbacks(this._rejectedCallbacks, err);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    notify : function(val) {
        if(this.isResolved()) {
            return;
        }

        this._callCallbacks(this._progressCallbacks, val);
    },

    then : function(onFulfilled, onRejected, onProgress, ctx) {
        if(onRejected && !isFunction(onRejected)) {
            ctx = onRejected;
            onRejected = undef;
        }
        else if(onProgress && !isFunction(onProgress)) {
            ctx = onProgress;
            onProgress = undef;
        }

        var promise = new Promise(),
            cb;

        if(!this._isRejected) {
            cb = { promise : promise, fn : isFunction(onFulfilled)? onFulfilled : undef, ctx : ctx };
            this._isFulfilled?
                this._callCallbacks([cb], this._res) :
                this._fulfilledCallbacks.push(cb);
        }

        if(!this._isFulfilled) {
            cb = { promise : promise, fn : onRejected, ctx : ctx };
            this._isRejected?
                this._callCallbacks([cb], this._res) :
                this._rejectedCallbacks.push(cb);
        }

        this.isResolved() || this._progressCallbacks.push({ promise : promise, fn : onProgress, ctx : ctx });

        return promise;
    },

    fail : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    always : function(onResolved, ctx) {
        var _this = this,
            cb = function() {
                return onResolved.call(this, _this);
            };

        return this.then(cb, cb, ctx);
    },

    progress : function(onProgress, ctx) {
        return this.then(undef, undef, onProgress, ctx);
    },

    spread : function(onFulfilled, onRejected, ctx) {
        return this.then(
            function(val) {
                return onFulfilled.apply(this, val);
            },
            onRejected,
            ctx);
    },

    done : function(onFulfilled, onRejected, onProgress, ctx) {
        this
            .then(onFulfilled, onRejected, onProgress, ctx)
            .fail(throwException);
    },

    delay : function(delay) {
        return this.then(function(val) {
            var promise = new Promise();
            setTimeout(
                function() {
                    promise.fulfill(val);
                },
                delay);
            return promise;
        });
    },

    timeout : function(timeout) {
        var promise = new Promise(),
            timer = setTimeout(
                function() {
                    promise.reject(Error('timed out'));
                },
                timeout);

        promise.sync(this);
        promise.always(function() {
            clearTimeout(timer);
        });

        return promise;
    },

    sync : function(promise) {
        promise.then(
            this.fulfill,
            this.reject,
            this.notify,
            this);
    },

    _callCallbacks : function(callbacks, arg) {
        var len = callbacks.length;
        if(!len) {
            return;
        }

        var isResolved = this.isResolved(),
            isFulfilled = this.isFulfilled();

        nextTick(function() {
            var i = 0, cb, promise, fn;
            while(i < len) {
                cb = callbacks[i++];
                promise = cb.promise;
                fn = cb.fn;

                if(fn) {
                    var ctx = cb.ctx,
                        res;
                    try {
                        res = ctx? fn.call(ctx, arg) : fn(arg);
                    }
                    catch(e) {
                        promise.reject(e);
                        continue;
                    }

                    isResolved?
                        Vow.isPromise(res)?
                            (function(promise) {
                                res.then(
                                    function(val) {
                                        promise.fulfill(val);
                                    },
                                    function(err) {
                                        promise.reject(err);
                                    },
                                    function(val) {
                                        promise.notify(val);
                                    });
                            })(promise) :
                            promise.fulfill(res) :
                        promise.notify(res);
                }
                else {
                    isResolved?
                        isFulfilled?
                            promise.fulfill(arg) :
                            promise.reject(arg) :
                        promise.notify(arg);
                }
            }
        });
    }
};

var Vow = {
    promise : function(val) {
        return arguments.length?
            Vow.isPromise(val)?
                val :
                new Promise(val) :
            new Promise();
    },

    when : function(obj, onFulfilled, onRejected, onProgress, ctx) {
        return Vow.promise(obj).then(onFulfilled, onRejected, onProgress, ctx);
    },

    fail : function(obj, onRejected, ctx) {
        return Vow.when(obj, undef, onRejected, ctx);
    },

    always : function(obj, onResolved, ctx) {
        return Vow.promise(obj).always(onResolved, ctx);
    },

    progress : function(obj, onProgress, ctx) {
        return Vow.promise(obj).progress(onProgress, ctx);
    },

    spread : function(obj, onFulfilled, onRejected, ctx) {
        return Vow.promise(obj).spread(onFulfilled, onRejected, ctx);
    },

    done : function(obj, onFulfilled, onRejected, onProgress, ctx) {
        Vow.promise(obj).done(onFulfilled, onRejected, onProgress, ctx);
    },

    isPromise : function(obj) {
        return obj && isFunction(obj.then);
    },

    valueOf : function(obj) {
        return Vow.isPromise(obj)? obj.valueOf() : obj;
    },

    isFulfilled : function(obj) {
        return Vow.isPromise(obj)? obj.isFulfilled() : true;
    },

    isRejected : function(obj) {
        return Vow.isPromise(obj)? obj.isRejected() : false;
    },

    isResolved : function(obj) {
        return Vow.isPromise(obj)? obj.isResolved() : true;
    },

    fulfill : function(val) {
        return Vow.when(val, undef, function(err) {
            return err;
        });
    },

    reject : function(err) {
        return Vow.when(err, function(val) {
            var promise = new Promise();
            promise.reject(val);
            return promise;
        });
    },

    resolve : function(val) {
        return Vow.isPromise(val)? val : Vow.when(val);
    },

    invoke : function(fn) {
        try {
            return Vow.promise(fn.apply(global, slice.call(arguments, 1)));
        }
        catch(e) {
            return Vow.reject(e);
        }
    },

    forEach : function(promises, onFulfilled, onRejected, keys) {
        var len = keys? keys.length : promises.length,
            i = 0;
        while(i < len) {
            Vow.when(promises[keys? keys[i] : i], onFulfilled, onRejected);
            ++i;
        }
    },

    all : function(promises) {
        var resPromise = new Promise(),
            isPromisesArray = isArray(promises),
            keys = isPromisesArray?
                getArrayKeys(promises) :
                getObjectKeys(promises),
            len = keys.length,
            res = isPromisesArray? [] : {};

        if(!len) {
            resPromise.fulfill(res);
            return resPromise;
        }

        var i = len,
            onFulfilled = function() {
                if(!--i) {
                    var j = 0;
                    while(j < len) {
                        res[keys[j]] = Vow.valueOf(promises[keys[j++]]);
                    }
                    resPromise.fulfill(res);
                }
            },
            onRejected = function(err) {
                resPromise.reject(err);
            };

        Vow.forEach(promises, onFulfilled, onRejected, keys);

        return resPromise;
    },

    allResolved : function(promises) {
        var resPromise = new Promise(),
            isPromisesArray = isArray(promises),
            keys = isPromisesArray?
                getArrayKeys(promises) :
                getObjectKeys(promises),
            i = keys.length,
            res = isPromisesArray? [] : {};

        if(!i) {
            resPromise.fulfill(res);
            return resPromise;
        }

        var onProgress = function() {
                --i || resPromise.fulfill(promises);
            };

        Vow.forEach(promises, onProgress, onProgress, keys);

        return resPromise;
    },

    allPatiently : function(promises) {
        return Vow.allResolved(promises).then(function() {
            var isPromisesArray = isArray(promises),
                keys = isPromisesArray?
                    getArrayKeys(promises) :
                    getObjectKeys(promises),
                rejectedPromises, fulfilledPromises,
                len = keys.length, i = 0, key, promise;

            if(!len) {
                return isPromisesArray? [] : {};
            }

            while(i < len) {
                key = keys[i++];
                promise = promises[key];
                if(Vow.isRejected(promise)) {
                    rejectedPromises || (rejectedPromises = isPromisesArray? [] : {});
                    isPromisesArray?
                        rejectedPromises.push(promise.valueOf()) :
                        rejectedPromises[key] = promise.valueOf();
                }
                else if(!rejectedPromises) {
                    (fulfilledPromises || (fulfilledPromises = isPromisesArray? [] : {}))[key] = Vow.valueOf(promise);
                }
            }

            if(rejectedPromises) {
                throw rejectedPromises;
            }

            return fulfilledPromises;
        });
    },

    any : function(promises) {
        var resPromise = new Promise(),
            len = promises.length;

        if(!len) {
            resPromise.reject(Error());
            return resPromise;
        }

        var i = 0, err,
            onFulfilled = function(val) {
                resPromise.fulfill(val);
            },
            onRejected = function(e) {
                i || (err = e);
                ++i === len && resPromise.reject(err);
            };

        Vow.forEach(promises, onFulfilled, onRejected);

        return resPromise;
    },

    delay : function(val, timeout) {
        return Vow.promise(val).delay(timeout);
    },

    timeout : function(val, timeout) {
        return Vow.promise(val).timeout(timeout);
    }
};

var undef,
    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__promise' + +new Date,
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                };
                (doc.documentElement || doc.body).appendChild(script);
            };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })(),
    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },
    isFunction = function(obj) {
        return typeof obj === 'function';
    },
    slice = Array.prototype.slice,
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    getArrayKeys = function(arr) {
        var res = [],
            i = 0, len = arr.length;
        while(i < len) {
            res.push(i++);
        }
        return res;
    },
    getObjectKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    };

var defineAsGlobal = true;
if(typeof exports === 'object') {
    module.exports = Vow;
    defineAsGlobal = false;
}

if(typeof modules === 'object') {
    modules.define('vow', function(provide) {
        provide(Vow);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = Vow;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.Vow = Vow);

})(this);

/**
 * Предоставляет функцию для расширения объектов.
 */
modules.define('extend', function (provide) {

    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var toString = Object.prototype.toString;

    /**
     * Проверяет, что переданный объект является "плоским" (т.е. созданным с помощью "{}"
     * или "new Object").
     *
     * @param {Object} obj
     * @returns {Boolean}
     */
    function isPlainObject(obj) {
        // Не являются плоским объектом:
        // - Любой объект или значение, чьё внутреннее свойство [[Class]] не равно "[object Object]"
        // - DOM-нода
        // - window
        return !(toString.call(obj) !== '[object Object]' ||
            obj.nodeType ||
            obj.window === window);
    }

    /**
     * Копирует перечислимые свойства одного или нескольких объектов в целевой объект.
     *
     * @param {Boolean} [deep=false] При значении `true` свойства копируются рекурсивно.
     * @param {Object} target Объект для расширения. Он получит новые свойства.
     * @param {Object} [...] Объекты со свойствами для копирования. Аргументы со значениями
     *      `null` или `undefined` игнорируются.
     * @returns {Object}
     */
    provide(function extend() {
        var target = arguments[0];
        var deep;
        var i;

        // Обрабатываем ситуацию глубокого копирования.
        if (typeof target === 'boolean') {
            deep = target;
            target = arguments[1];
            i = 2;
        } else {
            deep = false;
            i = 1;
        }

        for ( ; i < arguments.length; i++) {
            var obj = arguments[i];
            if (!obj) {
                continue;
            }

            for (var key in obj) {
                if (hasOwnProperty.call(obj, key)) {
                    var val = obj[key];
                    var isArray = false;

                    // Копируем "плоские" объекты и массивы рекурсивно.
                    if (deep && val && (isPlainObject(val) || (isArray = Array.isArray(val)))) {
                        var src = target[key];
                        var clone;
                        if (isArray) {
                            clone = src && Array.isArray(src) ? src : [];
                        } else {
                            clone = src && isPlainObject(src) ? src : {};
                        }
                        target[key] = extend(deep, clone, val);
                    } else {
                        target[key] = val;
                    }
                }
            }
        }

        return target;
    });
});

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

modules.define('bt', ["y-i18n"], function(provide, i18n) {
var BT = (function() {

/**
 * Счетчик используемый для генерации уникальных id в методе generateId.
 * @type {Number}
 */
var lastGenId = 0;

/**
 * BT: BtJson -> HTML процессор.
 * @constructor
 */
function BT() {
    /**
     * Используется для идентификации матчеров.
     * Каждому матчеру дается уникальный id для того, чтобы избежать повторного применения
     * матчера к одному и тому же узлу BtJson-дерева.
     * @type {Number}
     * @private
     */
    this._lastMatchId = 0;
    /**
     * Плоский массив для хранения матчеров.
     * Каждый элемент — массив с двумя элементами: [{String} выражение, {Function} матчер}]
     * @type {Array}
     * @private
     */
    this._matchers = {};
    /**
     * Отображения по умолчанию для блоков.
     * @type {Object}
     * @private
     */
    this._defaultViews = {};
    /**
     * Флаг, включающий автоматическую систему поиска зацикливаний. Следует использовать в development-режиме,
     * чтобы определять причины зацикливания.
     * @type {Boolean}
     * @private
     */
    this._infiniteLoopDetection = false;

    /**
     * Неймспейс для библиотек. Сюда можно писать различный функционал для дальнейшего использования в матчерах.
     * ```javascript
     * bt.lib.objects = bt.lib.objects || {};
     * bt.lib.objects.inverse = bt.lib.objects.inverse || function(obj) { ... };
     * ```
     * @type {Object}
     */
    this.lib = {};
    /**
     * Опции BT. Задаются через setOptions.
     * @type {Object}
     */
    this._options = {};
    this.utils = {

        _side: (typeof window === 'undefined') ? 's' : 'c',

        bt: this,

        /**
         * Возвращает позицию элемента в рамках родителя.
         * Отсчет производится с 1 (единицы).
         *
         * ```javascript
         * bt.match('list__item', function(ctx) {
         *     if (ctx.position() === 2) {
         *         ctx.setState('is-second');
         *     }
         * });
         * ```
         * @returns {Number}
         */
        getPosition: function () {
            var node = this.node;
            return node.index === '_content' ? 1 : node.index + 1;
        },

        /**
         * Возвращает true, если текущий bemjson-элемент первый в рамках родительского bemjson-элемента.
         *
         * ```javascript
         * bt.match('list__item', function(ctx) {
         *     if (ctx.isFirst()) {
         *         ctx.setState('is-first');
         *     }
         * });
         * ```
         * @returns {Boolean}
         */
        isFirst: function () {
            var node = this.node;
            return node.index === '_content' || node.index === 0;
        },

        /**
         * Возвращает true, если текущий bemjson-элемент последний в рамках родительского bemjson-элемента.
         *
         * ```javascript
         * bt.match('list__item', function(ctx) {
         *     if (ctx.isLast()) {
         *         ctx.setState('is-last');
         *     }
         * });
         * ```
         * @returns {Boolean}
         */
        isLast: function () {
            var node = this.node;
            return node.index === '_content' || node.index === node.arr.length - 1;
        },

        // --- HTML ---

        /**
         * Устанавливает тег.
         *
         * @param tagName
         * @returns {String|undefined}
         */
        setTag: function (tagName) {
            this.ctx._tag = tagName;
            return this;
        },

        /**
         * Возвращает тег.
         *
         * @returns {Ctx}
         */
        getTag: function () {
            return this.ctx._tag;
        },

        /**
         * Устанавливает значение атрибута.
         *
         * @param {String} attrName
         * @param {String} attrValue
         */
        setAttr: function (attrName, attrValue) {
            (this.ctx._attrs || (this.ctx._attrs = {}))[attrName] = attrValue;
            return this;
        },

        /**
         * Возвращает значение атрибута.
         *
         * @param {String} attrName
         * @returns {Ctx}
         */
        getAttr: function (attrName) {
            return this.ctx._attrs ? this.ctx._attrs[attrName] : undefined;
        },

        /**
         * Отключает генерацию атрибута `class`.
         *
         * @returns {Ctx}
         */
        disableCssClassGeneration: function () {
            this.ctx._disableCssGeneration = true;
            return this;
        },

        /**
         * Включает генерацию атрибута `class`. По умолчанию — включено.
         *
         * @returns {Ctx}
         */
        enableCssClassGeneration: function () {
            this.ctx._disableCssGeneration = false;
            return this;
        },

        /**
         * Возвращает `true` если генерация атрибута `class` включена.
         *
         * @returns {Boolean}
         */
        isCssClassGenerationEnabled: function () {
            return !Boolean(this.ctx._disableCssGeneration);
        },

        /**
         * Отключает генерацию дополнительных data-атрибутов.
         *
         * @returns {Ctx}
         */
        disableDataAttrGeneration: function () {
            this.ctx._disableDataAttrGeneration = true;
            return this;
        },

        /**
         * Включает генерацию дополнительных data-атрибутов.
         *
         * @returns {Ctx}
         */
        enableDataAttrGeneration: function () {
            this.ctx._disableDataAttrGeneration = false;
            return this;
        },

        /**
         * Возвращает `true` если генерация дополнительных data-атрибутов включена.
         *
         * @returns {Boolean}
         */
        isDataAttrGenerationEnabled: function () {
            return !Boolean(this.ctx._disableDataAttrGeneration);
        },

        // --- BEViS ---

        /**
         * Возвращает состояние по его имени.
         *
         * @param {String} stateName
         * @returns {String|Boolean|undefined}
         */
        getState: function (stateName) {
            return this.ctx._state ? this.ctx._state[stateName] : undefined;
        },

        /**
         * Устанавливает значение состояния.
         *
         * @param {String} stateName
         * @param {String|Boolean|null} stateValue
         * @returns {Ctx}
         */
        setState: function (stateName, stateValue) {
            (this.ctx._state || (this.ctx._state = {}))[stateName] =
                arguments.length === 1 ? true : stateValue;
            return this;
        },

        /**
         * Возвращает значение параметра (btjson).
         *
         * @param {String} paramName
         * @returns {*|undefined}
         */
        getParam: function (paramName) {
            return this.ctx[paramName];
        },

        /**
         * Возвращает значение view.
         *
         * @returns {String|undefined}
         */
        getView: function () {
            return this.ctx.view;
        },

        /**
         * Возвращает имя блока.
         *
         * @returns {String}
         */
        getBlockName: function () {
            return this.ctx.block;
        },

        /**
         * Возвращает имя элемента, если матчинг происходит на элемент.
         *
         * @returns {String|undefined}
         */
        getElementName: function () {
            return this.ctx.elem;
        },

        /**
         * Устанавливает содержимое.
         *
         * @param {BtJson} content
         * @returns {Ctx}
         */
        setContent: function (content) {
            this.ctx._content = content;
            return this;
        },

        /**
         * Возвращает содержимое.
         *
         * @returns {BtJson|undefined}
         */
        getContent: function () {
            return this.ctx._content;
        },

        /**
         * Возвращает набор миксинов, либо `undefined`.
         *
         * @returns {BtJson[]|undefined}
         */
        getMixins: function () {
            return this.ctx.mixins;
        },

        /**
         * Добавляет миксин.
         *
         * @param {BtJson} mixin
         * @returns {Ctx}
         */
        addMixin: function (mixin) {
            (this.ctx.mixins || (this.ctx.mixins = [])).push(mixin);
            return this;
        },

        /**
         * Включает автоматическую инициализацию.
         *
         * @returns {Ctx}
         */
        enableAutoInit: function () {
            if (this.ctx.autoInit !== false) {
                this.ctx.autoInit = true;
            }
            return this;
        },

        /**
         * Возвращает `true`, если для данного элемента включена автоматическая инициализация.
         *
         * @returns {Boolean}
         */
        isAutoInitEnabled: function () {
            return Boolean(this.ctx.autoInit);
        },

        /**
         * Устанавливает опцию, которая передается в JS-блок при инициализации.
         *
         * @param {String} optName
         * @param {*} optValue
         * @returns {Ctx}
         */
        setInitOption: function (optName, optValue) {
            (this.ctx._initOptions || (this.ctx._initOptions = {}))[optName] = optValue;
            return this;
        },

        /**
         * Возвращает значение опции, которая передается в JS-блок при инициализации.
         *
         * @param {String} optName
         * @returns {*}
         */
        getInitOption: function (optName) {
            return this.ctx._initOptions ? this.ctx._initOptions[optName] : undefined;
        },

        /**
         * Возвращает уникальный идентификатор. Может использоваться, например,
         * чтобы задать соответствие между `label` и `input`.
         * @returns {String}
         */
        generateId: function () {
            return 'uniq' + this._side + (lastGenId++);
        },

        /**
         * Останавливает выполнение прочих матчеров для данного bemjson-элемента.
         *
         * Пример:
         * ```javascript
         * bt.match('button', function(ctx) {
         *     ctx.setTag('button');
         * });
         * bt.match('button', function(ctx) {
         *     ctx.setTag('span');
         *     ctx.stop();
         * });
         * ```
         * @returns {Ctx}
         */
        stop: function () {
            this.ctx._stop = true;
            return this;
        },

        /**
         * Выполняет преобразования данного bemjson-элемента остальными матчерами.
         * Может понадобиться, например, чтобы добавить элемент в самый конец содержимого,
         * если в базовых шаблонах в конец содержимого добавляются другие элементы.
         *
         * Предоставляет минимальный функционал доопределения в рамках библиотеки.
         *
         * @returns {Ctx}
         */
        applyTemplates: function () {
            var prevCtx = this.ctx,
                prevNode = this.node;
            var res = this.bt.processBtJson(this.ctx, this.ctx.block, true);
            if (res !== prevCtx) {
                this.newCtx = res;
            }
            this.ctx = prevCtx;
            this.node = prevNode;
            return this;
        },

        /**
         * Возвращает текущий фрагмент BtJson-дерева.
         * Может использоваться в связке с `return` для враппинга и подобных целей.
         * ```javascript
         *
         * bt.match('input', function(ctx) {
         *     return {
         *         elem: 'wrapper',
         *         content: ctx.getJson()
         *     };
         * });
         * ```
         * @returns {Object|Array}
         */
        getJson: function () {
            return this.newCtx || this.ctx;
        },

        /**
         * Экранирует HTML.
         *
         * @param {String} val
         * @return {String}
         */
        escape: function (val) {
            return ('' + val)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g,'&#x2F;');
        }
    };
}

BT.prototype = {
    /**
     * Включает/выключает механизм определения зацикливаний.
     *
     * @param {Boolean} enable
     * @returns {BT}
     */
    enableInfiniteLoopDetection: function(enable) {
        this._infiniteLoopDetection = enable;
        return this;
    },

    /**
     * Преобразует BtJson в HTML-код.
     * @param {Object|Array|String} btJson
     */
    apply: function (btJson) {
        return this.toHtml(this.processBtJson(btJson));
    },

    /**
     * Объявляет матчер.
     *
     * ```javascript
     * bt.match('b-page', function(ctx) {
     *     ctx.addMixin({ block: 'i-ua' });
     *     ctx.setAttr('class', 'i-ua_js_no i-ua_css_standard');
     * });
     * bt.match('block_mod_modVal', function(ctx) {
     *     ctx.setTag('span');
     * });
     * bt.match('block__elem', function(ctx) {
     *     ctx.setAttr('disabled', 'disabled');
     * });
     * bt.match('block__elem_elemMod_elemModVal', function(ctx) {
     *     ctx.setState('is-active');
     * });
     * bt.match('block_blockMod_blockModVal__elem', function(ctx) {
     *     ctx.setContent({
     *         elem: 'wrapper',
     *         content: ctx.getJson()
     *     };
     * });
     * ```
     * @param {String|Array} expr
     * @param {Function} matcher
     * @returns {Ctx}
     */
    match: function (expr, matcher) {
        matcher.__id = '__func' + (this._lastMatchId++);
        if (Array.isArray(expr)) {
            for (var i = 0, l = expr.length; i < l; i++) {
                (this._matchers[expr[i]] || (this._matchers[expr[i]] = [])).unshift(matcher);
            }
        } else {
            (this._matchers[expr] || (this._matchers[expr] = [])).unshift(matcher);
        }
        return this;
    },

    /**
     * Устанавливает отображение по умолчанию для блока.
     *
     * @param {String} blockName
     * @param {String} viewName
     * @returns {BT}
     */
    setDefaultView: function (blockName, viewName) {
        this._defaultViews[blockName] = viewName;
        return this;
    },

    /**
     * Раскрывает BtJson, превращая его из краткого в полный.
     * @param {Object|Array} btJson
     * @param {String} [blockName]
     * @param {Boolean} [ignoreContent]
     * @returns {Object|Array}
     */
    processBtJson: function (btJson, blockName, ignoreContent) {
        var resultArr = [btJson];
        var nodes = [{ json: btJson, arr: resultArr, index: 0, blockName: blockName }];
        var node, json, block, blockView, i, l, p, child, subRes;
        var matchers = this._matchers;
        var processContent = !ignoreContent;
        var infiniteLoopDetection = this._infiniteLoopDetection;

        /**
         * Враппер для json-узла.
         * @constructor
         */
        function Ctx() {
            this.ctx = null;
            this.newCtx = null;
        }
        Ctx.prototype = this.utils;
        var ctx = new Ctx();
        while (node = nodes.shift()) {
            json = node.json;
            block = node.blockName;
            blockView = node.blockView;
            if (Array.isArray(json)) {
                for (i = 0, l = json.length; i < l; i++) {
                    child = json[i];
                    if (child !== false && child != null && typeof child === 'object') {
                        nodes.push({ json: child, arr: json, index: i, blockName: block, blockView: blockView });
                    }
                }
            } else {
                var content, stopProcess = false;
                if (json.elem) {
                    if (json.block && json.block !== block) {
                        block = json.block;
                        blockView = json.view = json.view || this._defaultViews[block];
                    } else {
                        block = json.block = json.block || block;
                        blockView = json.view = json.view || blockView || this._defaultViews[block];
                    }
                } else if (json.block) {
                    block = json.block;
                    blockView = json.view = json.view || this._defaultViews[block];
                }

                if (json.block) {

                    if (infiniteLoopDetection) {
                        json.__processCounter = (json.__processCounter || 0) + 1;
                        if (json.__processCounter > 100) {
                            throw new Error(
                                'Infinite loop detected at "' + json.block + (json.elem ? '__' + json.elem : '') + '".'
                            );
                        }
                    }

                    subRes = null;

                    if (!json._stop) {
                        ctx.node = node;
                        ctx.ctx = json;
                        var selectorPostfix = json.elem ? '__' + json.elem : '';

                        var matcherList = matchers[json.block + (json.view ? '_' + json.view : '') + selectorPostfix];
                        if (!matcherList && json.view) {
                            matcherList = matchers[json.block + '_' + json.view.split('-')[0] + '*' + selectorPostfix];
                        }
                        if (!matcherList) {
                            matcherList = matchers[json.block + '*' + selectorPostfix];
                        }

                        if (matcherList) {
                            for (i = 0, l = matcherList.length; i < l; i++) {
                                var matcher = matcherList[i], mid = matcher.__id;
                                if (!json[mid]) {
                                    json[mid] = true;
                                    subRes = matcher(ctx);
                                    if (subRes != null) {
                                        json = subRes;
                                        node.json = json;
                                        node.blockName = block;
                                        node.blockView = blockView;
                                        nodes.push(node);
                                        stopProcess = true;
                                        break;
                                    }
                                    if (json._stop) {
                                        break;
                                    }
                                }
                            }
                        }
                    }

                }

                if (!stopProcess) {
                    if (Array.isArray(json)) {
                        node.json = json;
                        node.blockName = block;
                        node.blockView = blockView;
                        nodes.push(node);
                    } else {
                        if (processContent && ((content = json._content) != null)) {
                            if (Array.isArray(content)) {
                                var flatten;
                                do {
                                    flatten = false;
                                    for (i = 0, l = content.length; i < l; i++) {
                                        if (Array.isArray(content[i])) {
                                            flatten = true;
                                            break;
                                        }
                                    }
                                    if (flatten) {
                                        json._content = content = content.concat.apply([], content);
                                    }
                                } while (flatten);
                                for (i = 0, l = content.length, p = l - 1; i < l; i++) {
                                    child = content[i];
                                    if (child !== false && child != null && typeof child === 'object') {
                                        nodes.push({
                                            json: child, arr: content, index: i, blockName: block, blockView: blockView
                                        });
                                    }
                                }
                            } else {
                                nodes.push({
                                    json: content, arr: json, index: '_content', blockName: block, blockView: blockView
                                });
                            }
                        }
                    }
                }
            }
            node.arr[node.index] = json;
        }
        return resultArr[0];
    },

    /**
     * Превращает раскрытый BtJson в HTML.
     * @param {Object|Array|String} json
     * @returns {String}
     */
    toHtml: function (json) {
        var res, i, l, item;
        if (json === false || json == null) return '';
        if (typeof json !== 'object') {
            return json;
        } else if (Array.isArray(json)) {
            res = '';
            for (i = 0, l = json.length; i < l; i++) {
                item = json[i];
                if (item !== false && item != null) {
                    res += this.toHtml(item);
                }
            }
            return res;
        } else {
            var jattr,
                attrs = json._disableDataAttrGeneration || json.elem || !json.block ?
                    '' :
                    ' data-block="' + json.block + '"', initOptions;

            if (jattr = json._attrs) {
                for (i in jattr) {
                    var attrVal = jattr[i];
                    if (attrVal === true) {
                        attrs += ' ' + i;
                    } else if (attrVal != null) {
                         attrs += ' ' + i + '="' + escapeAttr(jattr[i]) + '"';
                    }
                }
            }

            if (json._initOptions) {
                (initOptions = {}).options = json._initOptions;
            }

            var mixins = json.mixins;
            if (mixins && mixins.length) {
                (initOptions || (initOptions = {})).mixins = mixins;
            }

            if (initOptions) {
                attrs += ' data-options="' + escapeAttr(JSON.stringify(initOptions)) + '"';
            }

            var content, tag = (json._tag || 'div');
            res = '<' + tag;

            if (!json._disableCssGeneration) {
                res += ' class="';
                res += (json.block) +
                    (json.view ? '_' + json.view : '') +
                    (json.elem ? '__' + json.elem : '');

                var state = json._state;
                if (state) {
                    for (i in state) {
                        var stateVal = state[i];
                        if (stateVal != null && stateVal !== '' && stateVal !== false) {
                            if (stateVal === true) {
                                res += ' _' + i;
                            } else {
                                res += ' _' + i + '_' + stateVal;
                            }
                        }
                    }
                }

                if (json.autoInit || (mixins && mixins.length > 0)) {
                    res += ' _init';
                }

                res += '"';
            }

            res += attrs;

            if (selfCloseHtmlTags[tag]) {
                res += '/>';
            } else {
                res += '>';
                if ((content = json._content) != null) {
                    if (Array.isArray(content)) {
                        for (i = 0, l = content.length; i < l; i++) {
                            item = content[i];
                            if (item !== false && item != null) {
                                res += this.toHtml(item);
                            }
                        }
                    } else {
                        res += this.toHtml(content);
                    }
                }
                res += '</' + tag + '>';
            }
            return res;
        }
    }
};

var selfCloseHtmlTags = {
    area: 1,
    base: 1,
    br: 1,
    col: 1,
    command: 1,
    embed: 1,
    hr: 1,
    img: 1,
    input: 1,
    keygen: 1,
    link: 1,
    meta: 1,
    param: 1,
    source: 1,
    wbr: 1
};

var escapeAttr = function (attrVal) {
    attrVal += '';
    if (~attrVal.indexOf('&')) {
        attrVal = attrVal.replace(/&/g, '&amp;');
    }
    if (~attrVal.indexOf('"')) {
        attrVal = attrVal.replace(/"/g, '&quot;');
    }
    return attrVal;
};

return BT;
})();

if (typeof module !== 'undefined') {
    module.exports = BT;
}

var bt = new BT();
bt.lib.i18n = i18n;


    /**
     * @param {BtJson} body Содержимое страницы. Следует использовать вместо `content`.
     * @param {String} doctype Доктайп. По умолчанию используется HTML5 doctype.
     * @param {Object[]} styles Набор CSS-файлов для подключения.
     *                          Каждый элемент массива должен содержать ключ `url`, содержащий путь к файлу.
     * @param {Object[]} scripts Набор JS-файлов для подключения.
     *                           Каждый элемент массива должен содержать ключ `url`, содержащий путь к файлу.
     * @param {BtJson} head Дополнительные элементы для заголовочной части страницы.
     * @param {String} favicon Путь к фавиконке.
     */

    bt.match('page', function (ctx) {
        var styleElements;
        var styles = ctx.getParam('styles');
        if (styles) {
            styleElements = styles.map(function (style) {
                return {
                    elem: 'css',
                    url: style.url,
                    ie: style.ie
                };
            });
        }

        return [
            ctx.getParam('doctype') || '<!DOCTYPE html>',
            {
                elem: 'html',
                content: [
                    {
                        elem: 'head',
                        content: [
                            [
                                {
                                    elem: 'meta',
                                    charset: 'utf-8'
                                },
                                {
                                    elem: 'title',
                                    content: ctx.getParam('title')
                                },
                                ctx.getParam('image') ?
                                    {
                                        elem: 'image',
                                        url: ctx.getParam('image')
                                    } :
                                    '',
                                ctx.getParam('favicon') ?
                                    {
                                        elem: 'favicon',
                                        url: ctx.getParam('favicon')
                                    } :
                                    ''
                            ],
                            styleElements,
                            ctx.getParam('head')
                        ]
                    },
                    ctx.getJson()
                ]
            }
        ];
    });

    bt.match('page', function (ctx) {
        ctx.setTag('body');
        ctx.enableAutoInit();
        var scriptElements;
        var scripts = ctx.getParam('scripts');
        var lang = ctx.getParam('lang') || 'ru';
        if (scripts) {
            scriptElements = scripts.map(function (script) {
                return {
                    elem: 'js',
                    url: script.url ? script.url.replace('{lang}', lang) : undefined,
                    source: script.source
                };
            });
        }
        ctx.setContent([ctx.getParam('body'), scriptElements]);
    });

    bt.match('page__title', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('title');
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('page__html', function (ctx) {
        ctx.setTag('html');
        ctx.disableCssClassGeneration();
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('page__head', function (ctx) {
        ctx.setTag('head');
        ctx.disableCssClassGeneration();
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('page__meta', function (ctx) {
        ctx.setTag('meta');
        ctx.disableCssClassGeneration();
        ctx.setAttr('content', ctx.getParam('content'));
        ctx.setAttr('http-equiv', ctx.getParam('http-equiv'));
        ctx.setAttr('charset', ctx.getParam('charset'));
    });

    bt.match('page__favicon', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('link');
        ctx.setAttr('rel', 'shortcut icon');
        ctx.setAttr('href', ctx.getParam('url'));
    });

    bt.match('page__image', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('link');
        ctx.setAttr('rel', 'image_src');
        ctx.setAttr('href', ctx.getParam('url'));
    });

    bt.match('page__js', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('script');
        var url = ctx.getParam('url');
        if (url) {
            ctx.setAttr('src', url);
        }
        var source = ctx.getParam('source');
        if (source) {
            ctx.setContent(source);
        }
        ctx.setAttr('type', 'text/javascript');
    });

    bt.match('page__css', function (ctx) {
        ctx.disableCssClassGeneration();
        var url = ctx.getParam('url');

        if (url) {
            ctx.setTag('link');
            ctx.setAttr('rel', 'stylesheet');
            ctx.setAttr('href', url);
        } else {
            ctx.setTag('style');
        }

        var ie = ctx.getParam('ie');
        if (ie !== undefined) {
            if (ie === true) {
                return ['<!--[if IE]>', ctx.getJson(), '<![endif]-->'];
            } else if (ie === false) {
                return ['<!--[if !IE]> -->', ctx.getJson(), '<!-- <![endif]-->'];
            } else {
                return ['<!--[if ' + ie + ']>', ctx.getJson(), '<![endif]-->'];
            }
        }
    });



    bt.match('selfie*', function (ctx) {
    });


    bt.match('player*', function (ctx) {
        ctx.enableAutoInit();

        ctx.setContent([{
            block: 'turntable'
        }, {
            elem: 'list',
            tracks: ctx.getParam('tracks')
        }]);
    });

    bt.match('player*__list', function (ctx) {
        var tracks = ctx.getParam('tracks')
            .map(function (item) {
                return {
                    block: 'track',
                    name: item.name,
                    src: item.src
                };
            });
        ctx.setContent(tracks);
    });


    bt.match('turntable*', function (ctx) {
        ctx.enableAutoInit();
    });


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
        ctx.setTag('audio');
        ctx.setAttr('src', ctx.getParam('src'));
    });


    bt.match('poster*', function (ctx) {
        ctx.setContent({
            elem: 'image'
        });
    });

    bt.match('poster*__image', function (ctx) {
    });

provide(bt);
});
(function(){
function initKeyset(i18n) {
if (!i18n || typeof i18n !== "function") {
i18n = (function () {

function createI18nInstance() {
    /**
     * @param {String} keysetName
     * @param {String} keyName
     * @param {Object} [options]
     */
    var i18n = function (keysetName, keyName, options) {
        var keyset = i18n._keysets[keysetName];
        if (!keyset) {
            throw new Error('Keyset "' + keysetName + '" was not found.');
        }
        var value = keyset[keyName];
        if (value === undefined) {
            throw new Error('Key "' + keyName + '" in keyset "' + keysetName + '" was not found.');
        }
        if (typeof value === 'function') {
            return value(options || {});
        } else {
            return value;
        }
    };

    /**
     * @type {Object}
     */
    i18n._keysets = {};

    /**
     * @type {String}
     */
    i18n._language = 'ru';

    /**
     * @param {String} keysetName
     * @param {Object} keysetData
     */
    i18n.add = function (keysetName, keysetData) {
        i18n._keysets[keysetName] = keysetData;
        return i18n;
    };

    /**
     * @param {String} language
     */
    i18n.setLanguage = function (language) {
        this._language = language;
        return this;
    };

    /**
     * @returns {String}
     */
    i18n.getLanguage = function () {
        return this._language;
    };

    i18n.utils = {
        /**
         * @typedef {Object} YI18NPluralParams
         * @property {Number} count
         * @property {String} one
         * @property {String} some
         * @property {String} many
         */

        /**
         * @param {YI18NPluralParams} params
         * @returns {String}
         */
        plural: function (params) {
            var count = params.count;
            var one = params.one;
            var some = params.some;
            var many = params.many;
            if (many === undefined) {
                many = some;
            } else if (some === undefined) {
                some = many;
            }
            var lastDigit = count % 10;
            var tens = count % 100;

            if (lastDigit === 1 && tens !== 11) {
                return one;
            }

            return lastDigit > 1 && lastDigit < 5 && (tens < 10 || tens > 20) ? some : many;
        },

        /**
         * @typedef {Object} YI18NIncludeParams
         * @property {String} keyset
         * @property {String} key
         */

        /**
         * @param {YI18NIncludeParams} params
         * @returns {String}
         */
        include: function (params) {
            var subParams = {};
            for (var i in params) {
                if (params.hasOwnProperty(i) && i !== 'key' && i !== 'keyset') {
                    subParams[i] = params[i];
                }
            }
            return i18n(params.keyset, params.key, subParams);
        }
    };

    return i18n;
}

return createI18nInstance();

})();

}



i18n.setLanguage('ru');
return i18n;
}
if (typeof modules !== 'undefined') {
    modules.define('y-i18n', function (provide, i18n) {
        provide(initKeyset(i18n));
    });
} else if (typeof module !== 'undefined') {
    module.exports = function() {return initKeyset();};
} else if (typeof window !== 'undefined') {
    window.i18n = initKeyset();
} else {
    i18n = initKeyset();
}
})();

(function () {
var Modernizr = window.Modernizr;
try { delete window.Modernizr; } catch (e) {}
modules.define('modernizr', function (provide) { provide(Modernizr); });
})();

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1VzZXJzL21vcm96b3YvRG9jdW1lbnRzL3NjcmlwdHMvdGhldWNocG9jaG1hY2svcGFnZXMvaW5kZXgvaW5kZXgucnUuanMiLCJzb3VyY2VzIjpbIi4uLy4uL25vZGVfbW9kdWxlcy9lbmItYmV2aXMvbm9kZV9tb2R1bGVzL3ltL21vZHVsZXMuanMiLCIuLi8uLi9ibG9ja3MvY2xpZW50L3BsYXllci9wbGF5ZXIuanMiLCIuLi8uLi9ibG9ja3MvY2xpZW50L3R1cm50YWJsZS90dXJudGFibGUuanMiLCIuLi8uLi9ibG9ja3MvY29yZS9qcXVlcnkvanF1ZXJ5LmpzIiwiLi4vLi4vYmxvY2tzL2NvcmUvbG9hZC1zY3JpcHQvbG9hZC1zY3JpcHQuanMiLCIuLi8uLi9ibG9ja3MvY29yZS9qcXVlcnkvX19jb25maWcvanF1ZXJ5X19jb25maWcuanMiLCIuLi8uLi9ibG9ja3MvY29yZS9ibG9jay9ibG9jay5qcyIsIi4uLy4uL2Jsb2Nrcy9jb3JlL2luaGVyaXQvaW5oZXJpdC5qcyIsIi4uLy4uL2Jsb2Nrcy9jb3JlL2V2ZW50LWVtaXR0ZXIvZXZlbnQtZW1pdHRlci5qcyIsIi4uLy4uL2Jsb2Nrcy9jb3JlL2V2ZW50LW1hbmFnZXIvZXZlbnQtbWFuYWdlci5qcyIsIi4uLy4uL2Jsb2Nrcy9jb3JlL2Jsb2NrLWV2ZW50L2Jsb2NrLWV2ZW50LmpzIiwiLi4vLi4vYmxvY2tzL2NvcmUvdm93L3Zvdy5qcyIsIi4uLy4uL2Jsb2Nrcy9jb3JlL2V4dGVuZC9leHRlbmQuanMiLCIuLi8uLi9ibG9ja3MvY2xpZW50L3RyYWNrL3RyYWNrLmpzIiwiLi9pbmRleC5idC5jbGllbnQuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZW5iLWJ0L2xpYi9idC5qcyIsIi4uLy4uL2Jsb2Nrcy9jbGllbnQvcGFnZS9wYWdlLmJ0LmpzIiwiLi4vLi4vYmxvY2tzL2NsaWVudC9zZWxmaWUvc2VsZmllLmJ0LmpzIiwiLi4vLi4vYmxvY2tzL2NsaWVudC9wbGF5ZXIvcGxheWVyLmJ0LmpzIiwiLi4vLi4vYmxvY2tzL2NsaWVudC90dXJudGFibGUvdHVybnRhYmxlLmJ0LmpzIiwiLi4vLi4vYmxvY2tzL2NsaWVudC90cmFjay90cmFjay5idC5qcyIsIi4uLy4uL2Jsb2Nrcy9jbGllbnQvcG9zdGVyL3Bvc3Rlci5idC5qcyIsIi4vaW5kZXgubGFuZy5ydS5qcyIsImluZGV4Lm1vZGVybml6ci5ydS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBQUM7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0MzWkE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0M3SUE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQzNGQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQ2xCQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQ2xFQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0NMQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0NqcENBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NDakxBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0N2TUE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQzNJQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQzVEQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQzFqQkE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NDaEZBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQzVDQTtDQ0FBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDREVBO0NBQ0E7Q0V0eUJBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NDbEtBO0NBQ0E7Q0FDQTtDQUNBO0NDSEE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NDdkJBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0NKQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQ3JCQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDUGtnQ0E7Q0FDQTtDUTVnQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NDOG5JQTtDQUNBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQSJ9