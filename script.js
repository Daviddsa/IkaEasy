
require.toCache('/js/libs/db.js', function(require,module,exports) { (function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.db = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
        'use strict';

        var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

        var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

        function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

        (function (local) {
            'use strict';

            var IDBKeyRange = local.IDBKeyRange || local.webkitIDBKeyRange;
            var transactionModes = {
                readonly: 'readonly',
                readwrite: 'readwrite'
            };
            var hasOwn = Object.prototype.hasOwnProperty;
            var defaultMapper = function defaultMapper(x) {
                return x;
            };

            var indexedDB = local.indexedDB || local.webkitIndexedDB || local.mozIndexedDB || local.oIndexedDB || local.msIndexedDB || local.shimIndexedDB || function () {
                throw new Error('IndexedDB required');
            }();

            var dbCache = {};
            var serverEvents = ['abort', 'error', 'versionchange'];

            function isObject(item) {
                return item && (typeof item === 'undefined' ? 'undefined' : _typeof(item)) === 'object';
            }

            function mongoDBToKeyRangeArgs(opts) {
                var keys = Object.keys(opts).sort();
                if (keys.length === 1) {
                    var key = keys[0];
                    var val = opts[key];
                    var name = void 0,
                        inclusive = void 0;
                    switch (key) {
                        case 'eq':
                            name = 'only';break;
                        case 'gt':
                            name = 'lowerBound';
                            inclusive = true;
                            break;
                        case 'lt':
                            name = 'upperBound';
                            inclusive = true;
                            break;
                        case 'gte':
                            name = 'lowerBound';break;
                        case 'lte':
                            name = 'upperBound';break;
                        default:
                            throw new TypeError('`' + key + '` is not a valid key');
                    }
                    return [name, [val, inclusive]];
                }
                var x = opts[keys[0]];
                var y = opts[keys[1]];
                var pattern = keys.join('-');

                switch (pattern) {
                    case 'gt-lt':case 'gt-lte':case 'gte-lt':case 'gte-lte':
                    return ['bound', [x, y, keys[0] === 'gt', keys[1] === 'lt']];
                    default:
                        throw new TypeError('`' + pattern + '` are conflicted keys');
                }
            }
            function mongoifyKey(key) {
                if (key && (typeof key === 'undefined' ? 'undefined' : _typeof(key)) === 'object' && !(key instanceof IDBKeyRange)) {
                    var _mongoDBToKeyRangeArg = mongoDBToKeyRangeArgs(key);

                    var _mongoDBToKeyRangeArg2 = _slicedToArray(_mongoDBToKeyRangeArg, 2);

                    var type = _mongoDBToKeyRangeArg2[0];
                    var args = _mongoDBToKeyRangeArg2[1];

                    return IDBKeyRange[type].apply(IDBKeyRange, _toConsumableArray(args));
                }
                return key;
            }

            var IndexQuery = function IndexQuery(table, db, indexName, preexistingError) {
                var _this = this;

                var modifyObj = null;

                var runQuery = function runQuery(type, args, cursorType, direction, limitRange, filters, mapper) {
                    return new Promise(function (resolve, reject) {
                        var keyRange = void 0;
                        try {
                            keyRange = type ? IDBKeyRange[type].apply(IDBKeyRange, _toConsumableArray(args)) : null;
                        } catch (e) {
                            reject(e);
                            return;
                        }
                        filters = filters || [];
                        limitRange = limitRange || null;

                        var results = [];
                        var counter = 0;
                        var indexArgs = [keyRange];

                        var transaction = db.transaction(table, modifyObj ? transactionModes.readwrite : transactionModes.readonly);
                        transaction.onerror = function (e) {
                            return reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };
                        transaction.oncomplete = function () {
                            return resolve(results);
                        };

                        var store = transaction.objectStore(table); // if bad, db.transaction will reject first
                        var index = typeof indexName === 'string' ? store.index(indexName) : store;

                        if (cursorType !== 'count') {
                            indexArgs.push(direction || 'next');
                        }

                        // Create a function that will set in the modifyObj properties into
                        // the passed record.
                        var modifyKeys = modifyObj ? Object.keys(modifyObj) : [];

                        var modifyRecord = function modifyRecord(record) {
                            modifyKeys.forEach(function (key) {
                                var val = modifyObj[key];
                                if (typeof val === 'function') {
                                    val = val(record);
                                }
                                record[key] = val;
                            });
                            return record;
                        };

                        index[cursorType].apply(index, indexArgs).onsuccess = function (e) {
                            // indexArgs are already validated
                            var cursor = e.target.result;
                            if (typeof cursor === 'number') {
                                results = cursor;
                            } else if (cursor) {
                                if (limitRange !== null && limitRange[0] > counter) {
                                    counter = limitRange[0];
                                    cursor.advance(limitRange[0]); // Will throw on 0, but condition above prevents since counter always 0+
                                } else if (limitRange !== null && counter >= limitRange[0] + limitRange[1]) {
                                    // Out of limit range... skip
                                } else {
                                    var _ret = function () {
                                        var matchFilter = true;
                                        var result = 'value' in cursor ? cursor.value : cursor.key;

                                        try {
                                            filters.forEach(function (filter) {
                                                if (typeof filter[0] === 'function') {
                                                    matchFilter = matchFilter && filter[0](result);
                                                } else {
                                                    matchFilter = matchFilter && result[filter[0]] === filter[1];
                                                }
                                            });
                                        } catch (err) {
                                            // Could be filter on non-object or error in filter function
                                            reject(err);
                                            return {
                                                v: void 0
                                            };
                                        }

                                        if (matchFilter) {
                                            counter++;
                                            // If we're doing a modify, run it now
                                            if (modifyObj) {
                                                try {
                                                    result = modifyRecord(result);
                                                    cursor.update(result); // `result` should only be a "structured clone"-able object
                                                } catch (err) {
                                                    reject(err);
                                                    return {
                                                        v: void 0
                                                    };
                                                }
                                            }
                                            try {
                                                results.push(mapper(result));
                                            } catch (err) {
                                                reject(err);
                                                return {
                                                    v: void 0
                                                };
                                            }
                                        }
                                        cursor.continue();
                                    }();

                                    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
                                }
                            }
                        };
                    });
                };

                var Query = function Query(type, args, queuedError) {
                    var filters = [];
                    var direction = 'next';
                    var cursorType = 'openCursor';
                    var limitRange = null;
                    var mapper = defaultMapper;
                    var unique = false;
                    var error = preexistingError || queuedError;

                    var execute = function execute() {
                        if (error) {
                            return Promise.reject(error);
                        }
                        return runQuery(type, args, cursorType, unique ? direction + 'unique' : direction, limitRange, filters, mapper);
                    };

                    var count = function count() {
                        direction = null;
                        cursorType = 'count';

                        return {
                            execute: execute
                        };
                    };

                    var keys = function keys() {
                        cursorType = 'openKeyCursor';

                        return {
                            desc: desc,
                            distinct: distinct,
                            execute: execute,
                            filter: filter,
                            limit: limit,
                            map: map
                        };
                    };

                    var limit = function limit(start, end) {
                        limitRange = !end ? [0, start] : [start, end];
                        error = limitRange.some(function (val) {
                            return typeof val !== 'number';
                        }) ? new Error('limit() arguments must be numeric') : error;

                        return {
                            desc: desc,
                            distinct: distinct,
                            filter: filter,
                            keys: keys,
                            execute: execute,
                            map: map,
                            modify: modify
                        };
                    };

                    var filter = function filter(prop, val) {
                        filters.push([prop, val]);

                        return {
                            desc: desc,
                            distinct: distinct,
                            execute: execute,
                            filter: filter,
                            keys: keys,
                            limit: limit,
                            map: map,
                            modify: modify
                        };
                    };

                    var desc = function desc() {
                        direction = 'prev';

                        return {
                            distinct: distinct,
                            execute: execute,
                            filter: filter,
                            keys: keys,
                            limit: limit,
                            map: map,
                            modify: modify
                        };
                    };

                    var distinct = function distinct() {
                        unique = true;
                        return {
                            count: count,
                            desc: desc,
                            execute: execute,
                            filter: filter,
                            keys: keys,
                            limit: limit,
                            map: map,
                            modify: modify
                        };
                    };

                    var modify = function modify(update) {
                        modifyObj = update && (typeof update === 'undefined' ? 'undefined' : _typeof(update)) === 'object' ? update : null;
                        return {
                            execute: execute
                        };
                    };

                    var map = function map(fn) {
                        mapper = fn;

                        return {
                            count: count,
                            desc: desc,
                            distinct: distinct,
                            execute: execute,
                            filter: filter,
                            keys: keys,
                            limit: limit,
                            modify: modify
                        };
                    };

                    return {
                        count: count,
                        desc: desc,
                        distinct: distinct,
                        execute: execute,
                        filter: filter,
                        keys: keys,
                        limit: limit,
                        map: map,
                        modify: modify
                    };
                };

                ['only', 'bound', 'upperBound', 'lowerBound'].forEach(function (name) {
                    _this[name] = function () {
                        return Query(name, arguments);
                    };
                });

                this.range = function (opts) {
                    var error = void 0;
                    var keyRange = [null, null];
                    try {
                        keyRange = mongoDBToKeyRangeArgs(opts);
                    } catch (e) {
                        error = e;
                    }
                    return Query.apply(undefined, _toConsumableArray(keyRange).concat([error]));
                };

                this.filter = function () {
                    var query = Query(null, null);
                    return query.filter.apply(query, arguments);
                };

                this.all = function () {
                    return this.filter();
                };
            };

            var Server = function Server(db, name, version, noServerMethods) {
                var _this2 = this;

                var closed = false;

                this.getIndexedDB = function () {
                    return db;
                };
                this.isClosed = function () {
                    return closed;
                };

                this.query = function (table, index) {
                    var error = closed ? new Error('Database has been closed') : null;
                    return new IndexQuery(table, db, index, error); // Does not throw by itself
                };

                this.add = function (table) {
                    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                        args[_key - 1] = arguments[_key];
                    }

                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }

                        var records = args.reduce(function (records, aip) {
                            return records.concat(aip);
                        }, []);

                        var transaction = db.transaction(table, transactionModes.readwrite);
                        transaction.onerror = function (e) {
                            // prevent throwing a ConstraintError and aborting (hard)
                            // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                            e.preventDefault();
                            reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };
                        transaction.oncomplete = function () {
                            return resolve(records);
                        };

                        var store = transaction.objectStore(table);
                        records.some(function (record) {
                            var req = void 0,
                                key = void 0;
                            if (isObject(record) && hasOwn.call(record, 'item')) {
                                key = record.key;
                                record = record.item;
                                if (key != null) {
                                    try {
                                        key = mongoifyKey(key);
                                    } catch (e) {
                                        reject(e);
                                        return true;
                                    }
                                }
                            }

                            try {
                                // Safe to add since in readwrite
                                if (key != null) {
                                    req = store.add(record, key);
                                } else {
                                    req = store.add(record);
                                }
                            } catch (e) {
                                reject(e);
                                return true;
                            }

                            req.onsuccess = function (e) {
                                if (!isObject(record)) {
                                    return;
                                }
                                var target = e.target;
                                var keyPath = target.source.keyPath;
                                if (keyPath === null) {
                                    keyPath = '__id__';
                                }
                                if (hasOwn.call(record, keyPath)) {
                                    return;
                                }
                                Object.defineProperty(record, keyPath, {
                                    value: target.result,
                                    enumerable: true
                                });
                            };
                        });
                    });
                };

                this.update = function (table) {
                    for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                        args[_key2 - 1] = arguments[_key2];
                    }

                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }

                        var records = args.reduce(function (records, aip) {
                            return records.concat(aip);
                        }, []);

                        var transaction = db.transaction(table, transactionModes.readwrite);
                        transaction.onerror = function (e) {
                            // prevent throwing aborting (hard)
                            // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                            e.preventDefault();
                            reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };
                        transaction.oncomplete = function () {
                            return resolve(records);
                        };

                        var store = transaction.objectStore(table);

                        records.some(function (record) {
                            var req = void 0,
                                key = void 0;
                            if (isObject(record) && hasOwn.call(record, 'item')) {
                                key = record.key;
                                record = record.item;
                                if (key != null) {
                                    try {
                                        key = mongoifyKey(key);
                                    } catch (e) {
                                        reject(e);
                                        return true;
                                    }
                                }
                            }
                            try {
                                // These can throw DataError, e.g., if function passed in
                                if (key != null) {
                                    req = store.put(record, key);
                                } else {
                                    req = store.put(record);
                                }
                            } catch (err) {
                                reject(err);
                                return true;
                            }

                            req.onsuccess = function (e) {
                                if (!isObject(record)) {
                                    return;
                                }
                                var target = e.target;
                                var keyPath = target.source.keyPath;
                                if (keyPath === null) {
                                    keyPath = '__id__';
                                }
                                if (hasOwn.call(record, keyPath)) {
                                    return;
                                }
                                Object.defineProperty(record, keyPath, {
                                    value: target.result,
                                    enumerable: true
                                });
                            };
                        });
                    });
                };

                this.put = function () {
                    return this.update.apply(this, arguments);
                };

                this.remove = function (table, key) {
                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }
                        try {
                            key = mongoifyKey(key);
                        } catch (e) {
                            reject(e);
                            return;
                        }

                        var transaction = db.transaction(table, transactionModes.readwrite);
                        transaction.onerror = function (e) {
                            // prevent throwing and aborting (hard)
                            // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                            e.preventDefault();
                            reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };
                        transaction.oncomplete = function () {
                            return resolve(key);
                        };

                        var store = transaction.objectStore(table);
                        try {
                            store.delete(key);
                        } catch (err) {
                            reject(err);
                        }
                    });
                };

                this.delete = function () {
                    return this.remove.apply(this, arguments);
                };

                this.clear = function (table) {
                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }
                        var transaction = db.transaction(table, transactionModes.readwrite);
                        transaction.onerror = function (e) {
                            return reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };
                        transaction.oncomplete = function () {
                            return resolve();
                        };

                        var store = transaction.objectStore(table);
                        store.clear();
                    });
                };

                this.close = function () {
                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }
                        db.close();
                        closed = true;
                        delete dbCache[name][version];
                        resolve();
                    });
                };

                this.get = function (table, key) {
                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }
                        try {
                            key = mongoifyKey(key);
                        } catch (e) {
                            reject(e);
                            return;
                        }

                        var transaction = db.transaction(table);
                        transaction.onerror = function (e) {
                            // prevent throwing and aborting (hard)
                            // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                            e.preventDefault();
                            reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };

                        var store = transaction.objectStore(table);

                        var req = void 0;
                        try {
                            req = store.get(key);
                        } catch (err) {
                            reject(err);
                        }
                        req.onsuccess = function (e) {
                            return resolve(e.target.result);
                        };
                    });
                };

                this.count = function (table, key) {
                    return new Promise(function (resolve, reject) {
                        if (closed) {
                            reject(new Error('Database has been closed'));
                            return;
                        }
                        try {
                            key = mongoifyKey(key);
                        } catch (e) {
                            reject(e);
                            return;
                        }

                        var transaction = db.transaction(table);
                        transaction.onerror = function (e) {
                            // prevent throwing and aborting (hard)
                            // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                            e.preventDefault();
                            reject(e);
                        };
                        transaction.onabort = function (e) {
                            return reject(e);
                        };

                        var store = transaction.objectStore(table);
                        var req = void 0;
                        try {
                            req = key == null ? store.count() : store.count(key);
                        } catch (err) {
                            reject(err);
                        }
                        req.onsuccess = function (e) {
                            return resolve(e.target.result);
                        };
                    });
                };

                this.addEventListener = function (eventName, handler) {
                    if (!serverEvents.includes(eventName)) {
                        throw new Error('Unrecognized event type ' + eventName);
                    }
                    if (eventName === 'error') {
                        db.addEventListener(eventName, function (e) {
                            e.preventDefault(); // Needed by Firefox to prevent hard abort with ConstraintError
                            handler(e);
                        });
                        return;
                    }
                    db.addEventListener(eventName, handler);
                };

                this.removeEventListener = function (eventName, handler) {
                    if (!serverEvents.includes(eventName)) {
                        throw new Error('Unrecognized event type ' + eventName);
                    }
                    db.removeEventListener(eventName, handler);
                };

                serverEvents.forEach(function (evName) {
                    this[evName] = function (handler) {
                        this.addEventListener(evName, handler);
                        return this;
                    };
                }, this);

                if (noServerMethods) {
                    return;
                }

                var err = void 0;
                [].some.call(db.objectStoreNames, function (storeName) {
                    if (_this2[storeName]) {
                        err = new Error('The store name, "' + storeName + '", which you have attempted to load, conflicts with db.js method names."');
                        _this2.close();
                        return true;
                    }
                    _this2[storeName] = {};
                    var keys = Object.keys(_this2);
                    keys.filter(function (key) {
                        return ![].concat(serverEvents, ['close', 'addEventListener', 'removeEventListener']).includes(key);
                    }).map(function (key) {
                        return _this2[storeName][key] = function () {
                            for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
                                args[_key3] = arguments[_key3];
                            }

                            return _this2[key].apply(_this2, [storeName].concat(args));
                        };
                    });
                });
                return err;
            };

            var createSchema = function createSchema(e, request, schema, db, server, version) {
                if (!schema || schema.length === 0) {
                    return;
                }

                for (var i = 0; i < db.objectStoreNames.length; i++) {
                    var name = db.objectStoreNames[i];
                    if (!hasOwn.call(schema, name)) {
                        // Errors for which we are not concerned and why:
                        // `InvalidStateError` - We are in the upgrade transaction.
                        // `TransactionInactiveError` (as by the upgrade having already
                        //      completed or somehow aborting) - since we've just started and
                        //      should be without risk in this loop
                        // `NotFoundError` - since we are iterating the dynamically updated
                        //      `objectStoreNames`
                        db.deleteObjectStore(name);
                    }
                }

                var ret = void 0;
                Object.keys(schema).some(function (tableName) {
                    var table = schema[tableName];
                    var store = void 0;
                    if (db.objectStoreNames.contains(tableName)) {
                        store = request.transaction.objectStore(tableName); // Shouldn't throw
                    } else {
                        // Errors for which we are not concerned and why:
                        // `InvalidStateError` - We are in the upgrade transaction.
                        // `ConstraintError` - We are just starting (and probably never too large anyways) for a key generator.
                        // `ConstraintError` - The above condition should prevent the name already existing.
                        //
                        // Possible errors:
                        // `TransactionInactiveError` - if the upgrade had already aborted,
                        //      e.g., from a previous `QuotaExceededError` which is supposed to nevertheless return
                        //      the store but then abort the transaction.
                        // `SyntaxError` - if an invalid `table.key.keyPath` is supplied.
                        // `InvalidAccessError` - if `table.key.autoIncrement` is `true` and `table.key.keyPath` is an
                        //      empty string or any sequence (empty or otherwise).
                        try {
                            store = db.createObjectStore(tableName, table.key);
                        } catch (err) {
                            ret = err;
                            return true;
                        }
                    }

                    Object.keys(table.indexes || {}).some(function (indexKey) {
                        try {
                            store.index(indexKey);
                        } catch (err) {
                            var index = table.indexes[indexKey];
                            index = index && (typeof index === 'undefined' ? 'undefined' : _typeof(index)) === 'object' ? index : {};
                            // Errors for which we are not concerned and why:
                            // `InvalidStateError` - We are in the upgrade transaction and store found above should not have already been deleted.
                            // `ConstraintError` - We have already tried getting the index, so it shouldn't already exist
                            //
                            // Possible errors:
                            // `TransactionInactiveError` - if the upgrade had already aborted,
                            //      e.g., from a previous `QuotaExceededError` which is supposed to nevertheless return
                            //      the index object but then abort the transaction.
                            // `SyntaxError` - If the `keyPath` (second argument) is an invalid key path
                            // `InvalidAccessError` - If `multiEntry` on `index` is `true` and
                            //                          `keyPath` (second argument) is a sequence
                            try {
                                store.createIndex(indexKey, index.keyPath || index.key || indexKey, index);
                            } catch (err2) {
                                ret = err2;
                                return true;
                            }
                        }
                    });
                });
                return ret;
            };

            var _open = function _open(e, server, version, noServerMethods) {
                var db = e.target.result;
                dbCache[server][version] = db;

                var s = new Server(db, server, version, noServerMethods);
                return s instanceof Error ? Promise.reject(s) : Promise.resolve(s);
            };

            var db = {
                version: '0.15.0',
                open: function open(options) {
                    var server = options.server;
                    var version = options.version || 1;
                    var schema = options.schema;
                    var noServerMethods = options.noServerMethods;

                    if (!dbCache[server]) {
                        dbCache[server] = {};
                    }
                    return new Promise(function (resolve, reject) {
                        if (dbCache[server][version]) {
                            _open({
                                target: {
                                    result: dbCache[server][version]
                                }
                            }, server, version, noServerMethods).then(resolve, reject);
                        } else {
                            var _ret2 = function () {
                                if (typeof schema === 'function') {
                                    try {
                                        schema = schema();
                                    } catch (e) {
                                        reject(e);
                                        return {
                                            v: void 0
                                        };
                                    }
                                }
                                var request = indexedDB.open(server, version);

                                request.onsuccess = function (e) {
                                    return _open(e, server, version, noServerMethods).then(resolve, reject);
                                };
                                request.onerror = function (e) {
                                    // Prevent default for `BadVersion` and `AbortError` errors, etc.
                                    // These are not necessarily reported in console in Chrome but present; see
                                    //  https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                                    //  http://stackoverflow.com/questions/36225779/aborterror-within-indexeddb-upgradeneeded-event/36266502
                                    e.preventDefault();
                                    reject(e);
                                };
                                request.onupgradeneeded = function (e) {
                                    var err = createSchema(e, request, schema, e.target.result, server, version);
                                    if (err) {
                                        reject(err);
                                    }
                                };
                                request.onblocked = function (e) {
                                    var resume = new Promise(function (res, rej) {
                                        // We overwrite handlers rather than make a new
                                        //   open() since the original request is still
                                        //   open and its onsuccess will still fire if
                                        //   the user unblocks by closing the blocking
                                        //   connection
                                        request.onsuccess = function (ev) {
                                            _open(ev, server, version, noServerMethods).then(res, rej);
                                        };
                                        request.onerror = function (e) {
                                            return rej(e);
                                        };
                                    });
                                    e.resume = resume;
                                    reject(e);
                                };
                            }();

                            if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
                        }
                    });
                },

                delete: function _delete(dbName) {
                    return new Promise(function (resolve, reject) {
                        var request = indexedDB.deleteDatabase(dbName); // Does not throw

                        request.onsuccess = function (e) {
                            return resolve(e);
                        };
                        request.onerror = function (e) {
                            return reject(e);
                        }; // No errors currently
                        request.onblocked = function (e) {
                            // The following addresses part of https://bugzilla.mozilla.org/show_bug.cgi?id=1220279
                            e = e.newVersion === null || typeof Proxy === 'undefined' ? e : new Proxy(e, { get: function get(target, name) {
                                    return name === 'newVersion' ? null : target[name];
                                } });
                            var resume = new Promise(function (res, rej) {
                                // We overwrite handlers rather than make a new
                                //   delete() since the original request is still
                                //   open and its onsuccess will still fire if
                                //   the user unblocks by closing the blocking
                                //   connection
                                request.onsuccess = function (ev) {
                                    // The following are needed currently by PhantomJS: https://github.com/ariya/phantomjs/issues/14141
                                    if (!('newVersion' in ev)) {
                                        ev.newVersion = e.newVersion;
                                    }

                                    if (!('oldVersion' in ev)) {
                                        ev.oldVersion = e.oldVersion;
                                    }

                                    res(ev);
                                };
                                request.onerror = function (e) {
                                    return rej(e);
                                };
                            });
                            e.resume = resume;
                            reject(e);
                        };
                    });
                },

                cmp: function cmp(param1, param2) {
                    return new Promise(function (resolve, reject) {
                        try {
                            resolve(indexedDB.cmp(param1, param2));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
            };

            if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
                module.exports = db;
            } else if (typeof define === 'function' && define.amd) {
                define(function () {
                    return db;
                });
            } else {
                local.db = db;
            }
        })(self);


    },{}]},{},[1])(1)
}); });;
require.toCache('/js/helper/broker.js', function(require,module,exports) { 'use strict';

const ENV = 'prod';
let licenses = null;

class Broker {
    constructor() {
        this._loading = {};
        //this.getPurchases(null, true);
        //this.getSkuDetails();
    }

    buy(sku, callback) {
        google.payments.inapp.buy({
            'parameters': {'env': ENV},
            'sku': sku,
            'success': (purchase) => {
                this._onPurchase(sku, purchase, callback);
            },
            'failure': (purchase) => {
                this._onPurchase(sku, purchase, callback);
            }
        });
    }

    _onPurchase(sku, purchase) {
        if (purchase.response.errorType) {
            // Случилась ошибка
            console.warn(purchase);

            // ToDo показать уведомление о том, что покупка не удалась
            return;
        }

        Front.premiumUpdated();
    }





    getSkuDetails() {
        return new Promise((resolve, reject) => {
            if (!this.skuList) {
                if (!this._setLoadingCallback('getSkuDetails', resolve, reject)) {
                    return;
                }

                google.payments.inapp.getSkuDetails({
                    'parameters': {'env': 'prod'},
                    'success': (response) => {
                        this.onSkuDetails(response);
                    },
                    'failure': (response) => {
                        this.onSkuDetails(response);
                    }
                });

                return;
            }

            resolve(this.skuList);
        });
    }

    onSkuDetails(response) {
        let err = null;
        if (response.response.errorType) {
            // Случилась ошибка
            console.error(response);
            this._sendLoadingCallback('getSkuDetails', response.response.errorType);
            return;
        }

        this.skuList = {};

        _.each(response.response.details.inAppProducts, (product) => {
            _.each(product.prices, (price, k) => {
                product.prices[k].price = parseInt(price.valueMicros, 10) / 1000000;
            });

            this.skuList[product.sku] = product;
        });

        this._sendLoadingCallback('getSkuDetails', null, this.skuList);
    }





    getPurchases(force = false) {
        return new Promise((resolve, reject) => {
            if ((force) || (licenses === null)) {
                if (!this._setLoadingCallback('getPurchases', resolve, reject)) {
                    return;
                }

                google.payments.inapp.getPurchases({
                    'parameters': {'env': ENV},
                    'success': (response) => {
                        this.onGetPurchases(response);
                    },
                    'failure': (response) => {
                        this.onGetPurchases(response);
                    }
                });

                return;
            }

            resolve(licenses);
        });
    }

    onGetPurchases(response) {
        let err = null;
        if (response.response.errorType) {
            // Случилась ошибка
            console.error(response);
            err = response.response.errorType;

            this._sendLoadingCallback('getPurchases', response.response.errorType);
            return;
        }

        licenses = {};
        _.each(response.response.details, (license) => {
            licenses[license.sku] = license;
        });

        this._sendLoadingCallback('getPurchases', null, licenses);
    }




    _setLoadingCallback(key, resolve, reject) {
        if (this._loading[key]) {
            this._loading[key].push([resolve, reject]);
            return false;
        }

        this._loading[key] = [ [resolve, reject] ];
        return true;
    }

    _sendLoadingCallback(key, err, result) {
        _.each(this._loading[key], (res) => {
            if (err) {
                res[1](err);
            } else {
                res[0](result);
            }
        });

        this._loading[key] = null;
    }
}

module.exports = new Broker(); });;
require.toCache('/js/helper/cache.js', function(require,module,exports) { class CacheService{
    constructor(){
        this.cache = {};
    }

    //TODO: localstorage
    getModuleCache(module){
        if(!(module in this.cache)){
            this.cache[module] = {};
        }
        return this.cache[module];
    }
}
module.exports = new CacheService();
 });;
require.toCache('/js/helper/db.js', function(require,module,exports) { 'use strict';

module.exports = {
    db: function() {
        return {'source': BUILDINGS, 'pos': POSITIONS, 'images': IMAGES};
    },

    getIslands: function() {
        return {
            1: {
                13: [5228, 2, "Torautia"],
                14: [5224, 1, "Lolios"],
                15: [5221, 3, "Bratuios"],
                16: [5220, 4, "Banuitia"],
                17: [5218, 3, "Treibios"],
                25: [4847, 1, "Warooos"],
                26: [4848, 4, "Ghaatia"],
                29: [4861, 2, "Honuitia"],
                30: [4862, 3, "Taibios"],
                41: [4297, 3, "Pokios"],
                42: [4296, 4, "Soiwiios"],
                43: [4294, 1, "Pepyos"],
                44: [4295, 2, "Samoitia"],
                53: [4864, 4, "Thofeos"],
                54: [4866, 2, "Isseos"],
                55: [4868, 4, "Phimuios"],
                56: [4870, 2, "Chrorios"],
                58: [4872, 3, "Athyos"],
                59: [4874, 1, "Heydiios"],
                60: [4876, 3, "Lesuos"],
                61: [4878, 1, "Doipios"],
                86: [5638, 4, "Blibios"],
                87: [5639, 2, "Hatoos"]
            },
            2: {
                2: [5488, 1, "Rezios"],
                3: [5486, 2, "Eritia"],
                4: [5484, 1, "Luirios"],
                5: [5482, 3, "Thromoos"],
                6: [5480, 1, "Hatios"],
                10: [5232, 2, "Peretia"],
                11: [5230, 1, "Onitia"],
                13: [5227, 3, "Ackytia"],
                14: [5223, 4, "Craeliios"],
                15: [5222, 2, "Schakios"],
                16: [5219, 1, "Thaquos"],
                17: [5217, 2, "Heboos"],
                25: [4846, 3, "Blaudios"],
                26: [4844, 2, "Aldaetia"],
                27: [4845, 3, "Tujios"],
                29: [4860, 1, "Denayos"],
                30: [4859, 4, "Masyios"],
                31: [4858, 3, "Niewios"],
                32: [4857, 4, "Queysios"],
                37: [4265, 4, "Sneiroios"],
                38: [4266, 1, "Releos"],
                39: [4267, 4, "Nyyios"],
                41: [4299, 1, "Ripios"],
                42: [4298, 2, "Rycios"],
                43: [4292, 3, "Kisaos"],
                44: [4293, 4, "Nylios"],
                53: [4863, 3, "Oldoos"],
                54: [4865, 1, "Tuidyios"],
                55: [4867, 3, "Banoutia"],
                56: [4869, 1, "Yeraytia"],
                58: [4871, 2, "Rhelios"],
                59: [4873, 4, "Zaraios"],
                60: [4875, 2, "Huinios"],
                61: [4877, 4, "Duryos"],
                63: [5257, 1, "Tridios"],
                64: [5259, 2, "Ridios"],
                65: [5261, 4, "Cleichiios"],
                66: [5263, 2, "Moqaios"],
                75: [5500, 1, "Roedios"],
                76: [5499, 4, "Puruos"],
                77: [5497, 1, "Elduos"],
                78: [5498, 3, "Llehyos"],
                80: [5502, 1, "Leudios"],
                81: [5503, 2, "Ravoios"],
                84: [5627, 1, "Filios"],
                85: [5629, 3, "Imyos"],
                86: [5631, 1, "Rhibiios"],
                87: [5633, 3, "Vorotia"],
                95: [5719, 4, "Ormyos"],
                96: [5720, 3, "Hirios"]
            },
            3: {
                2: [5487, 4, "Ackeos"],
                3: [5485, 3, "Loruos"],
                4: [5483, 4, "Vesauos"],
                5: [5481, 2, "Smotios"],
                6: [5479, 4, "Claekaios"],
                8: [5236, 2, "Perotia"],
                9: [5235, 1, "Hockoos"],
                10: [5231, 3, "Orios"],
                11: [5229, 4, "Shilaos"],
                13: [5226, 2, "Roilios"],
                14: [5225, 1, "Tomoos"],
                19: [5192, 2, "Totios"],
                20: [5191, 3, "Samutia"],
                22: [4836, 2, "Menios"],
                23: [4837, 4, "Tinutia"],
                26: [4842, 4, "Torotia"],
                27: [4843, 1, "Politia"],
                31: [4855, 2, "Osaios"],
                32: [4856, 1, "Ranoos"],
                37: [4264, 3, "Liyaos"],
                38: [4263, 2, "Umytia"],
                39: [4262, 3, "Blakios"],
                43: [4290, 1, "Nywuos"],
                44: [4291, 2, "Ziheios"],
                50: [4315, 2, "Essaitia"],
                51: [4314, 1, "Chealios"],
                63: [5254, 4, "Phayiios"],
                64: [5258, 2, "Aweutia"],
                65: [5260, 3, "Kimeos"],
                66: [5262, 1, "Droubios"],
                67: [5264, 3, "Sariios"],
                68: [5266, 1, "Bazios"],
                70: [5272, 2, "Clemyios"],
                71: [5273, 1, "Suluos"],
                72: [5276, 2, "Anautia"],
                73: [5277, 1, "Areatia"],
                75: [5493, 2, "Straimyios"],
                76: [5494, 3, "Snosios"],
                77: [5495, 2, "Usteutia"],
                78: [5496, 4, "Skelaios"],
                80: [5501, 4, "Zhyteos"],
                81: [5504, 3, "Rhuihios"],
                82: [5511, 2, "Nyeitia"],
                84: [5626, 4, "Ormaos"],
                85: [5628, 2, "Pyvios"],
                86: [5630, 4, "Banytia"],
                87: [5632, 2, "Morytia"],
                88: [5634, 4, "Oughoos"],
                89: [5637, 3, "Dickyos"],
                91: [5676, 1, "Danutia"],
                92: [5677, 4, "Seuloos"],
                93: [5678, 3, "Nibios"],
                95: [5718, 2, "Druimeos"],
                96: [5716, 1, "Ildoos"],
                97: [5717, 2, "Moraeos"],
                98: [5721, 1, "Smeedios"]
            },
            4: {
                2: [5489, 1, "Whubios"],
                3: [5490, 2, "Noghios"],
                8: [5237, 3, "Thraboos"],
                9: [5234, 4, "Treetios"],
                10: [5233, 2, "Banutia"],
                16: [5199, 2, "Tonaytia"],
                17: [5198, 4, "Pisios"],
                19: [5190, 4, "Lyeaos"],
                20: [5188, 1, "Snydios"],
                22: [4835, 1, "Loraos"],
                23: [4832, 3, "Wabaios"],
                24: [4833, 1, "Kimios"],
                26: [4840, 2, "Angaos"],
                27: [4841, 3, "Ackoios"],
                29: [4850, 3, "Raelios"],
                30: [4852, 1, "Cawios"],
                31: [4854, 3, "Daneos"],
                34: [4255, 4, "Layios"],
                35: [4254, 1, "Rutaos"],
                39: [4257, 1, "Nahios"],
                40: [4258, 3, "Dracoos"],
                41: [4261, 2, "Serytia"],
                43: [4288, 3, "Oughaios"],
                44: [4289, 4, "Poloios"],
                46: [4304, 4, "Zesios"],
                47: [4305, 1, "Chilios"],
                48: [4309, 4, "Onuos"],
                49: [4310, 1, "Myluos"],
                50: [4312, 4, "Sulios"],
                51: [4313, 3, "Suletia"],
                53: [3616, 3, "Iaatia"],
                54: [3615, 2, "Tavaos"],
                56: [4317, 4, "Adeos"],
                57: [4319, 1, "Strierios"],
                58: [4320, 3, "Inaotia"],
                59: [4323, 1, "Inguos"],
                60: [4325, 3, "Draotia"],
                61: [4326, 2, "Tinetia"],
                67: [5265, 4, "Isoos"],
                68: [5267, 2, "Theroos"],
                70: [5270, 3, "Lecaios"],
                71: [5271, 4, "Slidios"],
                72: [5274, 3, "Whoceos"],
                73: [5275, 4, "Bredios"],
                75: [5491, 4, "Ingoutia"],
                76: [5492, 1, "Roerios"],
                81: [5505, 4, "Smecaios"],
                82: [5506, 1, "Yereuos"],
                88: [5635, 1, "Padios"],
                89: [5636, 2, "Stynios"],
                91: [5675, 3, "Soriios"],
                92: [5674, 2, "Yeratia"],
                93: [5673, 1, "Dryhios"],
                96: [5715, 3, "Sheurios"],
                97: [5713, 4, "Warios"],
                98: [5714, 3, "Chaaos"]
            },
            5: {
                5: [5464, 1, "Strurios"],
                6: [5462, 3, "Reypios"],
                8: [5239, 2, "Uskaos"],
                9: [5238, 1, "Sairdeios"],
                12: [5216, 2, "Voroetia"],
                13: [5205, 3, "Rothitia"],
                14: [5204, 2, "Ometia"],
                16: [5200, 3, "Choitaios"],
                17: [5197, 1, "Beduios"],
                20: [5187, 2, "Adotia"],
                23: [4831, 2, "Neasuios"],
                24: [4834, 4, "Boldeios"],
                26: [4838, 4, "Mositia"],
                27: [4839, 1, "Moryos"],
                29: [4849, 2, "Wuireos"],
                30: [4851, 4, "Neeyios"],
                31: [4853, 2, "Ineaos"],
                33: [4246, 1, "Lereutia"],
                34: [4247, 3, "Broozyos"],
                35: [4248, 2, "Cloruios"],
                36: [4249, 4, "Draietia"],
                37: [4253, 1, "Augheos"],
                39: [4256, 2, "Chiwaios"],
                40: [4259, 4, "Daniaos"],
                41: [4260, 1, "Banyos"],
                46: [4302, 2, "Bedios"],
                47: [4303, 3, "Ereetia"],
                48: [4306, 2, "Yetoos"],
                49: [4308, 3, "Maigios"],
                50: [4311, 2, "Kasuios"],
                53: [3613, 4, "Turytia"],
                54: [3614, 1, "Blounaos"],
                56: [4316, 3, "Llielios"],
                57: [4318, 2, "Bayios"],
                58: [4321, 4, "Whakios"],
                59: [4322, 2, "Syjios"],
                60: [4324, 4, "Bleecios"],
                61: [4327, 1, "Bymyios"],
                63: [4884, 1, "Beleos"],
                64: [4885, 3, "Moliios"],
                65: [4886, 2, "Shoodios"],
                70: [5268, 1, "Keleaos"],
                71: [5269, 2, "Rodoos"],
                78: [5298, 1, "Untauos"],
                79: [5299, 2, "Woulios"],
                81: [5507, 2, "Myzios"],
                82: [5508, 3, "Philaios"],
                84: [5513, 2, "Maedios"],
                85: [5514, 4, "Urnaos"],
                86: [5519, 2, "Dririios"],
                93: [5667, 2, "Lasyos"],
                94: [5668, 4, "Smanios"],
                97: [5711, 2, "Claehaios"],
                98: [5712, 1, "Gunoios"]
            },
            6: {
                3: [5467, 4, "Threucios"],
                4: [5465, 2, "Ougheytia"],
                5: [5463, 4, "Broseios"],
                6: [5461, 2, "Stidaios"],
                8: [5241, 3, "Leuthuos"],
                9: [5240, 4, "Smysios"],
                11: [5207, 1, "Essoos"],
                12: [5206, 4, "Tineaos"],
                13: [5203, 1, "Sackuios"],
                14: [5202, 4, "Hausios"],
                16: [5201, 2, "Reymaos"],
                17: [5196, 4, "Etatia"],
                18: [5195, 2, "Ditios"],
                20: [5184, 3, "Emetia"],
                21: [5182, 1, "Quiedaos"],
                23: [4830, 1, "Trealeos"],
                24: [4828, 3, "Hinoios"],
                33: [4244, 2, "Sutios"],
                34: [4245, 4, "Endaos"],
                35: [4250, 1, "Mosooos"],
                36: [4251, 3, "Cykeios"],
                37: [4252, 2, "Bulios"],
                43: [3593, 4, "Vesitia"],
                44: [3594, 1, "Adeetia"],
                46: [4300, 4, "Schodiios"],
                47: [4301, 1, "Inaeos"],
                52: [3611, 2, "Blobeos"],
                53: [3612, 3, "Daroos"],
                63: [4883, 2, "Nitaos"],
                64: [4881, 4, "Foloios"],
                65: [4882, 1, "Poluios"],
                67: [4898, 2, "Phurdoios"],
                68: [4899, 3, "Swatios"],
                73: [5282, 2, "Thuraios"],
                74: [5283, 4, "Urnatia"],
                76: [5292, 1, "Sleyrdeos"],
                77: [5293, 2, "Uskeytia"],
                78: [5294, 3, "Bisaos"],
                79: [5295, 4, "Crugaios"],
                81: [5509, 4, "Loildeios"],
                82: [5510, 1, "Haduios"],
                84: [5512, 1, "Sluiwoos"],
                85: [5515, 3, "Veseos"],
                86: [5518, 1, "Sexios"],
                88: [5642, 1, "Kikoios"],
                89: [5643, 2, "Banatia"],
                90: [5644, 3, "Zasios"],
                91: [5645, 4, "Usketia"],
                93: [5666, 1, "Sayeutia"],
                94: [5664, 3, "Strasios"],
                95: [5665, 2, "Slikaos"]
            },
            7: {
                3: [5468, 1, "Moreos"],
                4: [5466, 3, "Delutia"],
                11: [5209, 3, "Droijios"],
                12: [5208, 2, "Tonietia"],
                17: [5194, 1, "Reimios"],
                18: [5193, 3, "Chesios"],
                20: [5183, 2, "Blasoos"],
                21: [5181, 4, "Mesios"],
                23: [4829, 4, "Awytia"],
                24: [4827, 2, "Yyhios"],
                26: [4239, 2, "Moratia"],
                27: [4240, 3, "Heylios"],
                28: [4241, 1, "Uskytia"],
                30: [4236, 3, "Naimeos"],
                31: [4235, 4, "Ziabios"],
                39: [3582, 4, "Ormeyos"],
                40: [3583, 3, "Tosios"],
                41: [3586, 4, "Tearios"],
                43: [3591, 2, "Daedios"],
                44: [3592, 3, "Nunyos"],
                49: [3606, 3, "Undeatia"],
                50: [3605, 4, "Slaitios"],
                52: [3609, 4, "Oseetia"],
                53: [3610, 1, "Ghaoutia"],
                55: [3618, 1, "Acketia"],
                56: [3619, 4, "Dyhaos"],
                57: [3624, 1, "Urnauos"],
                59: [3626, 1, "Kelieos"],
                60: [3628, 3, "Belotia"],
                61: [3630, 1, "Drivios"],
                64: [4879, 3, "Achaos"],
                65: [4880, 2, "Himios"],
                67: [4897, 1, "Waybios"],
                68: [4896, 4, "Llynoos"],
                69: [4895, 3, "Rakeuos"],
                70: [4900, 4, "Laefios"],
                72: [5278, 1, "Tetios"],
                73: [5280, 3, "Hateatia"],
                74: [5284, 1, "Ghaitia"],
                76: [5290, 3, "Taeloios"],
                77: [5291, 4, "Llautios"],
                85: [5516, 2, "Eriaos"],
                86: [5517, 4, "Mashaos"],
                88: [5640, 3, "Doosyos"],
                89: [5641, 4, "Veruos"],
                90: [5646, 1, "Eldootia"],
                91: [5647, 2, "Bledios"],
                94: [5662, 4, "Uskiatia"],
                95: [5663, 1, "Tumios"],
                97: [5689, 1, "Cotios"],
                98: [5690, 2, "Smiadios"]
            },
            8: {
                3: [5469, 2, "Atoios"],
                4: [5470, 4, "Kivios"],
                6: [5453, 1, "Caxiios"],
                7: [5452, 4, "Radetia"],
                9: [5213, 3, "Raduios"],
                10: [5212, 2, "Clearios"],
                11: [5211, 1, "Ranios"],
                12: [5210, 4, "Soltyios"],
                14: [5173, 3, "Treidios"],
                15: [5172, 2, "Omytia"],
                26: [4238, 1, "Zowaos"],
                27: [4237, 4, "Smiachios"],
                28: [4231, 2, "Snyvuos"],
                29: [4230, 4, "Smileios"],
                30: [4232, 1, "Denieos"],
                31: [4233, 2, "Jigios"],
                33: [3573, 1, "Nilaos"],
                34: [3574, 2, "Sameuos"],
                36: [3577, 3, "Worouos"],
                37: [3578, 4, "Wuilios"],
                38: [3580, 1, "Malios"],
                39: [3581, 2, "Uskotia"],
                40: [3584, 1, "Nifoios"],
                41: [3585, 2, "Rhyseos"],
                43: [3589, 4, "Ruidoos"],
                44: [3590, 1, "Athetia"],
                46: [3600, 2, "Imytia"],
                47: [3601, 1, "Etoeos"],
                48: [3602, 4, "Swadios"],
                49: [3603, 1, "Engootia"],
                50: [3604, 2, "Daritia"],
                52: [3607, 2, "Cheuhios"],
                53: [3608, 3, "Eneutia"],
                55: [3617, 2, "Snynoios"],
                56: [3620, 3, "Buretia"],
                57: [3623, 2, "Nomoios"],
                59: [3625, 4, "Suloos"],
                60: [3627, 2, "Shoenios"],
                61: [3629, 4, "Thoecios"],
                62: [3631, 2, "Rothaeos"],
                69: [4893, 1, "Famoios"],
                70: [4894, 2, "Sauceios"],
                72: [5279, 2, "Quoteios"],
                73: [5281, 4, "Streluios"],
                74: [5285, 2, "Nasuios"],
                76: [5288, 1, "Ineeutia"],
                77: [5289, 2, "Lyeoitia"],
                79: [5300, 3, "Imoos"],
                80: [5302, 4, "Atheytia"],
                81: [5304, 3, "Blukeos"],
                82: [5310, 2, "Peuxyos"],
                83: [5311, 1, "Ciamios"],
                91: [5648, 3, "Emios"],
                92: [5649, 4, "Phyckios"],
                97: [5687, 3, "Ataos"],
                98: [5688, 4, "Aughieos"]
            },
            9: {
                6: [5454, 2, "Ineietia"],
                7: [5451, 3, "Peroitia"],
                9: [5215, 1, "Demios"],
                10: [5214, 4, "Choiduios"],
                14: [5171, 1, "Stregios"],
                15: [5170, 4, "Lobios"],
                17: [4825, 3, "Zebios"],
                18: [4824, 2, "Rodotia"],
                19: [4822, 4, "Reyheos"],
                20: [4820, 1, "Siroos"],
                22: [4203, 2, "Diesaos"],
                23: [4202, 1, "Umuos"],
                24: [4224, 3, "Delotia"],
                28: [4229, 3, "Ashutia"],
                29: [4228, 1, "Sticaos"],
                33: [3571, 3, "Tisuios"],
                34: [3572, 4, "Umoos"],
                36: [3575, 1, "Chroiroos"],
                37: [3576, 2, "Llodios"],
                38: [3579, 3, "Kanyios"],
                43: [3587, 2, "Erouos"],
                44: [3588, 3, "Randaios"],
                46: [3599, 4, "Daneios"],
                47: [3597, 3, "Lyeoios"],
                48: [3598, 2, "Lukios"],
                56: [3621, 4, "Woroos"],
                57: [3622, 1, "Phodios"],
                62: [3632, 3, "Esseos"],
                63: [3633, 4, "Nagios"],
                65: [4328, 4, "Umeaos"],
                66: [4330, 2, "Kimuos"],
                67: [4332, 4, "Ceroos"],
                69: [4891, 3, "Poleitia"],
                70: [4892, 4, "Brybuos"],
                76: [5286, 3, "Angiatia"],
                77: [5287, 4, "Laupios"],
                79: [5301, 1, "Huifios"],
                80: [5303, 2, "Neipuos"],
                81: [5305, 1, "Dredeos"],
                82: [5306, 4, "Dapaios"],
                83: [5308, 3, "Hekios"],
                85: [5520, 4, "Vesoos"],
                86: [5522, 3, "Garatia"],
                87: [5524, 4, "Blofeos"],
                88: [5526, 2, "Drozios"],
                89: [5528, 4, "Moiqyios"],
                91: [5651, 2, "Tidios"],
                92: [5650, 1, "Ingeos"],
                94: [5679, 3, "Burieos"],
                95: [5680, 4, "Druilios"],
                96: [5685, 1, "Bripios"],
                97: [5686, 2, "Weanios"]
            },
            10: {
                1: [5478, 1, "Mybiios"],
                2: [5472, 2, "Kulios"],
                3: [5471, 1, "Rynyos"],
                5: [5457, 1, "Pheusios"],
                6: [5455, 3, "Dytios"],
                12: [5175, 1, "Latios"],
                13: [5174, 4, "Riatios"],
                14: [5169, 3, "Kalootia"],
                15: [5168, 2, "Dariaos"],
                17: [4826, 4, "Sixios"],
                18: [4823, 1, "Quikeios"],
                19: [4821, 3, "Wakios"],
                20: [4819, 2, "Heceos"],
                22: [4204, 3, "Dyniatia"],
                23: [4201, 4, "Queoutia"],
                24: [4199, 2, "Strukios"],
                25: [4200, 1, "Sicios"],
                26: [4225, 2, "Bleihios"],
                28: [4226, 4, "Theidios"],
                29: [4227, 2, "Yimyios"],
                31: [3567, 4, "Tuiluos"],
                32: [3568, 1, "Toneeos"],
                33: [3570, 2, "Falios"],
                40: [2857, 2, "Teepoios"],
                41: [2858, 3, "Thereuos"],
                47: [3595, 4, "Dynoos"],
                48: [3596, 1, "Sabuos"],
                50: [2883, 1, "Omotia"],
                51: [2882, 4, "Swadiios"],
                53: [2892, 3, "Salios"],
                54: [2893, 4, "Oraeos"],
                59: [2902, 1, "Larios"],
                60: [2903, 2, "Enthutia"],
                62: [3635, 2, "Woiruios"],
                63: [3634, 1, "Dykios"],
                65: [4329, 1, "Craleos"],
                66: [4331, 3, "Ingoitia"],
                67: [4333, 1, "Lorotia"],
                70: [4889, 1, "Brourtuios"],
                71: [4890, 2, "Daijios"],
                73: [4911, 4, "Mosiatia"],
                74: [4912, 2, "Rhainios"],
                82: [5307, 2, "Belyos"],
                83: [5309, 1, "Banoos"],
                85: [5521, 1, "Zurios"],
                86: [5523, 2, "Seretia"],
                87: [5525, 1, "Quugios"],
                88: [5527, 3, "Rhipios"],
                89: [5529, 1, "Toraytia"],
                91: [5653, 4, "Umoitia"],
                92: [5652, 3, "Queeraios"],
                94: [5681, 1, "Soedyos"],
                95: [5682, 2, "Zhysuios"],
                96: [5683, 3, "Yuistuios"],
                97: [5684, 4, "Clauntios"],
                99: [5700, 1, "Awootia"],
                100: [5701, 3, "Swymyos"]
            },
            11: {
                1: [5477, 3, "Tebios"],
                2: [5474, 4, "Kalitia"],
                3: [5473, 3, "Deliaos"],
                5: [5458, 2, "Sleleos"],
                6: [5456, 4, "Koloos"],
                8: [5253, 1, "Ageoetia"],
                9: [5252, 4, "Warutia"],
                11: [5180, 2, "Oughitia"],
                12: [5177, 3, "Ituos"],
                13: [5176, 2, "Fayleos"],
                14: [5167, 1, "Smaeryos"],
                15: [5166, 4, "Nyetia"],
                24: [4198, 3, "Hinuos"],
                25: [4197, 4, "Tonotia"],
                26: [4196, 3, "Taydios"],
                31: [3565, 2, "Tafios"],
                32: [3566, 3, "Fokeos"],
                33: [3569, 4, "Nothiios"],
                35: [2847, 1, "Thuwios"],
                36: [2848, 2, "Rhenyios"],
                37: [2851, 1, "Leryios"],
                38: [2852, 2, "Phuinios"],
                40: [2855, 1, "Bobios"],
                41: [2856, 4, "Eruos"],
                42: [2860, 2, "Bluinios"],
                44: [2870, 3, "Toubeios"],
                45: [2871, 2, "Rhypaos"],
                50: [2881, 2, "Seyjuios"],
                51: [2880, 3, "Loreos"],
                53: [2890, 2, "Bleynios"],
                54: [2891, 1, "Queios"],
                56: [2896, 3, "Cirdeos"],
                57: [2897, 1, "Rakoos"],
                58: [2901, 2, "Rothoos"],
                59: [2900, 4, "Stronios"],
                60: [2904, 3, "Kimutia"],
                66: [4334, 2, "Swaygheios"],
                67: [4335, 4, "Yerootia"],
                68: [4338, 2, "Deckios"],
                70: [4887, 3, "Bimios"],
                71: [4888, 4, "Trorios"],
                73: [4902, 1, "Emeatia"],
                74: [4904, 3, "Bucaos"],
                75: [4906, 1, "Creesaos"],
                76: [4908, 3, "Naluos"],
                77: [4910, 1, "Rhotoos"],
                79: [4914, 2, "Sojiios"],
                80: [4915, 4, "Blanios"],
                99: [5699, 2, "Ceapheos"],
                100: [5702, 4, "Phocyios"]
            },
            12: {
                2: [5476, 2, "Tiaotia"],
                3: [5475, 1, "Toneos"],
                5: [5459, 3, "Smourios"],
                6: [5460, 1, "Aleauos"],
                8: [5251, 3, "Feadeios"],
                9: [5250, 2, "Endootia"],
                11: [5179, 1, "Mocaios"],
                12: [5178, 4, "Lyeeaos"],
                17: [4816, 3, "Runnyos"],
                18: [4817, 4, "Fapios"],
                20: [4192, 1, "Snantoios"],
                21: [4191, 3, "Fasyos"],
                22: [4190, 1, "Noinaios"],
                25: [4194, 1, "Nandaos"],
                26: [4195, 2, "Ninaios"],
                28: [3563, 2, "Drusoos"],
                29: [3564, 1, "Ghaaeos"],
                35: [2845, 3, "Craeleos"],
                36: [2846, 4, "Schibios"],
                37: [2849, 3, "Aldeyos"],
                38: [2850, 4, "Radeaos"],
                40: [2853, 2, "Echitia"],
                41: [2854, 3, "Rhyhios"],
                42: [2859, 1, "Undaos"],
                44: [2869, 4, "Awetia"],
                45: [2866, 1, "Ruzeios"],
                46: [2868, 3, "Omoios"],
                47: [2873, 4, "Jutheios"],
                49: [2876, 1, "Lloraos"],
                50: [2877, 4, "Liadios"],
                51: [2879, 1, "Athaetia"],
                53: [2888, 3, "Ceratia"],
                54: [2889, 4, "Smiejeos"],
                56: [2894, 2, "Bawios"],
                57: [2895, 4, "Draatia"],
                58: [2898, 3, "Hisios"],
                59: [2899, 1, "Danatia"],
                60: [2905, 2, "Caijios"],
                62: [3636, 3, "Maweos"],
                63: [3638, 1, "Cohiios"],
                64: [3640, 3, "Laegios"],
                67: [4336, 1, "Zeseos"],
                68: [4337, 3, "Enaytia"],
                73: [4901, 4, "Coerios"],
                74: [4903, 2, "Yoeraios"],
                75: [4905, 4, "Daneatia"],
                76: [4907, 2, "Yesoios"],
                77: [4909, 4, "Quoekios"],
                79: [4913, 3, "Onuios"],
                80: [4916, 1, "Quaios"],
                81: [4917, 2, "Sufeios"],
                82: [4920, 4, "Keuckoios"],
                84: [4922, 4, "Imuos"],
                85: [4923, 1, "Nurios"],
                86: [4926, 4, "Gocaos"],
                88: [5339, 2, "Muibios"],
                89: [5340, 3, "Nyatia"],
                90: [5343, 2, "Zotuios"],
                91: [5344, 3, "Wauteios"],
                92: [5345, 4, "Emoeos"],
                94: [5539, 2, "Thrusios"],
                95: [5540, 1, "Oughios"],
                97: [5691, 3, "Untitia"],
                98: [5693, 1, "Samayos"],
                99: [5695, 3, "Voritia"],
                100: [5697, 1, "Sherios"]
            },
            13: {
                8: [5249, 1, "Crahiios"],
                9: [5248, 4, "Sadios"],
                14: [4812, 2, "Verooos"],
                15: [4813, 3, "Badaos"],
                16: [4814, 1, "Rhytios"],
                17: [4815, 2, "Angeos"],
                18: [4818, 1, "Trenios"],
                20: [4193, 2, "Phigoos"],
                21: [4185, 4, "Weylaios"],
                22: [4184, 3, "Tozios"],
                23: [4187, 1, "Ereuos"],
                28: [3559, 4, "Blusios"],
                29: [3560, 3, "Leahuos"],
                30: [3562, 1, "Deypyos"],
                32: [2832, 2, "Minios"],
                33: [2833, 3, "Giadios"],
                45: [2865, 4, "Llenios"],
                46: [2867, 2, "Drearoos"],
                47: [2872, 1, "Thrivios"],
                49: [2874, 2, "Tamios"],
                50: [2875, 3, "Kimitia"],
                51: [2878, 2, "Rakeaos"],
                53: [2886, 1, "Kilios"],
                54: [2887, 2, "Kinytia"],
                62: [3637, 4, "Chrealeios"],
                63: [3639, 2, "Itieos"],
                64: [3641, 4, "Atatia"],
                65: [3642, 1, "Slaraios"],
                70: [3658, 1, "Kadyos"],
                71: [3657, 3, "Samios"],
                81: [4918, 3, "Aldutia"],
                82: [4919, 1, "Ageootia"],
                84: [4921, 2, "Niroios"],
                85: [4924, 3, "Omios"],
                86: [4925, 2, "Kalouos"],
                88: [5337, 4, "Ponyios"],
                89: [5338, 1, "Sulayos"],
                90: [5341, 4, "Polietia"],
                91: [5342, 1, "Ceyliios"],
                92: [5346, 2, "Gareos"],
                94: [5536, 3, "Brajuos"],
                95: [5538, 4, "Yerotia"],
                97: [5692, 4, "Moonios"],
                98: [5694, 2, "Asautia"],
                99: [5696, 4, "Saseos"],
                100: [5698, 2, "Vesoios"]
            },
            14: {
                3: [5450, 4, "Motoos"],
                4: [5448, 2, "Slauxeos"],
                5: [5446, 4, "Talios"],
                6: [5444, 2, "Croloos"],
                8: [5247, 3, "Ougheos"],
                9: [5246, 2, "Rotheutia"],
                11: [4804, 3, "Echuitia"],
                12: [4806, 1, "Burootia"],
                14: [4811, 1, "Elmeos"],
                15: [4809, 4, "Neabios"],
                16: [4810, 3, "Kalooos"],
                21: [4182, 2, "Tanoutia"],
                22: [4183, 4, "Wierios"],
                23: [4186, 2, "Reiluios"],
                25: [3555, 2, "Serootia"],
                26: [3556, 3, "Lavuios"],
                28: [3557, 1, "Mizios"],
                29: [3558, 2, "Oldeytia"],
                30: [3561, 4, "Oldaetia"],
                32: [2830, 4, "Jidoos"],
                33: [2831, 1, "Schawios"],
                35: [2844, 1, "Slaubios"],
                36: [2843, 2, "Yelios"],
                38: [2223, 4, "Roikios"],
                39: [2224, 1, "Lanaos"],
                41: [2226, 1, "Dauvios"],
                42: [2227, 2, "Kaizios"],
                43: [2233, 4, "Doudios"],
                45: [2862, 1, "Swuhios"],
                46: [2864, 3, "Toroos"],
                53: [2884, 3, "Bypios"],
                54: [2885, 4, "Zhutios"],
                56: [2266, 4, "Iaytia"],
                57: [2267, 1, "Coonios"],
                59: [2906, 2, "Swotyos"],
                60: [2908, 4, "Straldios"],
                65: [3643, 2, "Ackyos"],
                66: [3645, 4, "Radaitia"],
                68: [3648, 2, "Kautaos"],
                69: [3650, 4, "Croeloios"],
                70: [3652, 2, "Enooos"],
                71: [3654, 4, "Morios"],
                72: [3656, 2, "Jecyos"],
                74: [3668, 1, "Rilaios"],
                75: [3669, 2, "Halluos"],
                76: [3670, 1, "Cerios"],
                78: [4339, 2, "Whoxios"],
                79: [4341, 4, "Rilutia"],
                85: [4929, 4, "Vaykuios"],
                86: [4927, 1, "Garotia"],
                88: [5335, 2, "Achoutia"],
                89: [5336, 3, "Ightautia"],
                94: [5535, 2, "Runios"],
                95: [5537, 1, "Cyrios"]
            },
            15: {
                3: [5449, 3, "Ormios"],
                4: [5447, 1, "Bexuos"],
                5: [5445, 3, "Cruiseos"],
                6: [5443, 1, "Keloutia"],
                8: [5245, 1, "Yaireios"],
                9: [5244, 4, "Toreios"],
                11: [4803, 4, "Yimios"],
                12: [4805, 2, "Ageotia"],
                15: [4807, 2, "Pyloos"],
                16: [4808, 1, "Waroos"],
                18: [4181, 3, "Wavios"],
                19: [4180, 2, "Phainyios"],
                25: [3553, 4, "Covoios"],
                26: [3554, 1, "Soowios"],
                32: [2828, 2, "Taydoos"],
                33: [2829, 3, "Tasetia"],
                34: [2840, 2, "Mydios"],
                35: [2841, 3, "Bromaos"],
                36: [2842, 4, "Buinios"],
                38: [2221, 2, "Peannaios"],
                39: [2222, 3, "Leroutia"],
                41: [2225, 4, "Moseios"],
                42: [2228, 3, "Phacios"],
                43: [2234, 1, "Turoos"],
                45: [2861, 4, "Tinoutia"],
                46: [2863, 2, "Augheetia"],
                48: [2249, 3, "Jylios"],
                49: [2250, 4, "Schiemiios"],
                50: [2253, 3, "Soroos"],
                51: [2254, 4, "Dynuos"],
                56: [2264, 2, "Nitios"],
                57: [2265, 3, "Tinios"],
                59: [2907, 1, "Rynuos"],
                60: [2909, 3, "Umooos"],
                61: [2910, 4, "Luipios"],
                62: [2912, 2, "Nakios"],
                63: [2920, 1, "Bruimaios"],
                65: [3644, 3, "Leicios"],
                66: [3646, 1, "Drysios"],
                68: [3647, 1, "Phyntuios"],
                69: [3649, 3, "Sayaos"],
                70: [3651, 1, "Lelios"],
                71: [3653, 3, "Tomyos"],
                72: [3655, 1, "Joteos"],
                74: [3665, 4, "Sudios"],
                75: [3666, 3, "Yakeios"],
                76: [3667, 4, "Sevios"],
                78: [4340, 3, "Schonyos"],
                79: [4342, 1, "Naitios"],
                80: [4343, 2, "Peyios"],
                81: [4345, 4, "Thrilios"],
                82: [4347, 2, "Swemiios"],
                83: [4349, 4, "Emeeos"],
                85: [4930, 2, "Drauios"],
                86: [4928, 3, "Nygios"],
                91: [5321, 3, "Somios"],
                92: [5323, 2, "Thitios"],
                94: [5532, 3, "Lasiios"],
                95: [5534, 4, "Queymios"],
                96: [5542, 2, "Cheeeos"],
                98: [5708, 2, "Snesyos"],
                99: [5707, 3, "Iaios"],
                100: [5710, 1, "Crodios"]
            },
            16: {
                8: [5243, 3, "Jaeneios"],
                9: [5242, 2, "Tiwuos"],
                11: [4799, 1, "Achitia"],
                12: [4797, 3, "Nysaeos"],
                13: [4796, 2, "Oldooos"],
                18: [4178, 4, "Enieos"],
                19: [4179, 1, "Trodyos"],
                21: [3548, 2, "Chodios"],
                22: [3547, 1, "Gulios"],
                23: [3546, 4, "Blivuios"],
                25: [3551, 2, "Phozios"],
                26: [3552, 3, "Deneos"],
                28: [2825, 4, "Rordiios"],
                29: [2824, 2, "Whirios"],
                30: [2823, 1, "Hamios"],
                32: [2826, 4, "Shoerios"],
                33: [2827, 1, "Sycios"],
                34: [2838, 4, "Atheuos"],
                35: [2839, 1, "Quipoos"],
                38: [2219, 4, "Kolleos"],
                39: [2220, 1, "Lakoos"],
                42: [2229, 4, "Chahuios"],
                43: [2231, 2, "Naxios"],
                48: [2247, 1, "Sluhios"],
                49: [2248, 2, "Loyios"],
                50: [2251, 1, "Tipios"],
                51: [2252, 2, "Lideos"],
                52: [2257, 3, "Gareaos"],
                53: [2258, 4, "Yeroutia"],
                55: [2262, 4, "Rurryios"],
                56: [2263, 1, "Emoos"],
                61: [2911, 1, "Nalytia"],
                62: [2913, 3, "Dozios"],
                63: [2916, 4, "Diriios"],
                74: [3663, 2, "Jurios"],
                75: [3664, 1, "Quaetia"],
                80: [4344, 3, "Chrealaos"],
                81: [4346, 1, "Tikios"],
                82: [4348, 3, "Thukoos"],
                83: [4350, 1, "Uskieos"],
                88: [5312, 1, "Ryziios"],
                89: [5314, 3, "Crarios"],
                90: [5319, 2, "Quifios"],
                91: [5320, 4, "Tonoetia"],
                92: [5324, 1, "Asaeos"],
                94: [5531, 2, "Thriruos"],
                95: [5533, 1, "Zhaynios"],
                96: [5541, 3, "Blaruios"],
                98: [5705, 1, "Dyzaos"],
                99: [5706, 4, "Neheios"],
                100: [5709, 2, "Sledeos"]
            },
            17: {
                3: [5442, 2, "Belietia"],
                4: [5433, 4, "Thereatia"],
                5: [5431, 2, "Wareaos"],
                6: [5429, 4, "Nadoios"],
                11: [4800, 2, "Kianios"],
                12: [4798, 4, "Phojios"],
                13: [4795, 1, "Nedios"],
                15: [4173, 3, "Rabios"],
                16: [4172, 2, "Imaytia"],
                17: [4177, 3, "Radyos"],
                18: [4176, 2, "Layrios"],
                21: [3543, 4, "Buraos"],
                22: [3544, 3, "Umeios"],
                23: [3545, 2, "Tanyos"],
                25: [3549, 4, "Hoonios"],
                26: [3550, 1, "Toneyos"],
                28: [2820, 1, "Ineytia"],
                29: [2821, 3, "Quadios"],
                30: [2822, 4, "Laumoos"],
                37: [2213, 2, "Blausoos"],
                38: [2214, 3, "Resuos"],
                39: [2217, 2, "Fokaios"],
                40: [2218, 3, "Dicios"],
                42: [2230, 1, "Neiliios"],
                43: [2232, 3, "Rejuios"],
                45: [2237, 1, "Echoetia"],
                46: [2239, 3, "Trapios"],
                51: [2255, 1, "Ormitia"],
                52: [2256, 2, "Baulios"],
                53: [2259, 1, "Wiadios"],
                55: [2260, 2, "Tinautia"],
                56: [2261, 3, "Nycios"],
                58: [2273, 4, "Rhylaos"],
                59: [2274, 2, "Biaxaos"],
                62: [2914, 2, "Keabiios"],
                63: [2915, 1, "Phanios"],
                64: [2919, 2, "Rodyos"],
                66: [2923, 1, "Drikeios"],
                67: [2924, 4, "Cresteios"],
                68: [2930, 1, "Ildeytia"],
                69: [2929, 2, "Seritia"],
                71: [2937, 3, "Tieshiios"],
                72: [2938, 4, "Beuluios"],
                74: [3661, 4, "Ineutia"],
                75: [3662, 3, "Nesoios"],
                77: [3672, 1, "Isetia"],
                78: [3674, 3, "Radios"],
                82: [4351, 2, "Osoeos"],
                83: [4353, 4, "Tonoitia"],
                85: [4356, 4, "Tylluos"],
                86: [4357, 1, "Nataos"],
                88: [5313, 2, "Honaos"],
                89: [5315, 4, "Veratia"],
                90: [5316, 1, "Nisheios"],
                98: [5703, 2, "Rhiesios"],
                99: [5704, 3, "Ardeos"]
            },
            18: {
                2: [5435, 2, "Tariios"],
                3: [5434, 1, "Shotaios"],
                4: [5432, 3, "Cenios"],
                5: [5430, 1, "Enthetia"],
                6: [5428, 3, "Rhayrreos"],
                8: [5163, 3, "Nolios"],
                9: [5165, 1, "Itoetia"],
                15: [4170, 4, "Aughuos"],
                16: [4171, 1, "Esteutia"],
                17: [4174, 4, "Noityios"],
                18: [4175, 1, "Voofios"],
                20: [3540, 1, "Lorouos"],
                21: [3541, 2, "Isytia"],
                22: [3542, 1, "Asheutia"],
                28: [2818, 4, "Turyos"],
                29: [2819, 2, "Nytios"],
                32: [2205, 2, "Rodoutia"],
                33: [2204, 1, "Urnautia"],
                34: [2207, 3, "Nyxiios"],
                35: [2210, 4, "Quosios"],
                37: [2211, 4, "Puizeos"],
                38: [2212, 1, "Toxios"],
                39: [2215, 4, "Rotheetia"],
                40: [2216, 1, "Faicios"],
                42: [2235, 2, "Untiaos"],
                43: [2236, 4, "Doimios"],
                45: [2238, 2, "Soghoos"],
                46: [2240, 4, "Danuos"],
                47: [2241, 1, "Pielliios"],
                48: [2243, 3, "Chripios"],
                49: [2245, 1, "Nipios"],
                58: [2270, 1, "Danooos"],
                59: [2272, 3, "Ackuos"],
                60: [2281, 4, "Turautia"],
                63: [2917, 3, "Doleos"],
                64: [2918, 4, "Arotia"],
                66: [2921, 3, "Leukyos"],
                67: [2922, 2, "Saryios"],
                68: [2926, 3, "Maywios"],
                69: [2928, 1, "Umouos"],
                71: [2935, 1, "Issios"],
                72: [2936, 2, "Dakios"],
                74: [3659, 1, "Swathuos"],
                75: [3660, 2, "Nougios"],
                77: [3671, 4, "Sereios"],
                78: [3673, 2, "Yaeboos"],
                79: [3675, 4, "Zhyldeios"],
                80: [3680, 2, "Blourios"],
                82: [4352, 3, "Asaytia"],
                83: [4354, 1, "Voexios"],
                85: [4355, 3, "Losaos"],
                86: [4358, 2, "Rhiaghaos"],
                89: [5317, 2, "Yedaios"],
                90: [5318, 3, "Lyeatia"],
                92: [5325, 1, "Daryos"],
                93: [5327, 3, "Nehios"],
                94: [5329, 1, "Nisuios"],
                95: [5331, 3, "Bliedios"],
                96: [5333, 1, "Rodoeos"]
            },
            19: {
                2: [5437, 4, "Vorutia"],
                3: [5436, 3, "Seyios"],
                8: [5162, 2, "Styjios"],
                9: [5164, 4, "Rayootia"],
                11: [4794, 2, "Hielios"],
                12: [4792, 4, "Rhabios"],
                14: [4168, 2, "Issaos"],
                15: [4169, 3, "Sayytia"],
                20: [3538, 4, "Iaoos"],
                21: [3539, 3, "Cryrios"],
                24: [2813, 4, "Keizaios"],
                25: [2812, 2, "Naraos"],
                27: [2816, 2, "Quofoios"],
                28: [2817, 1, "Mecios"],
                31: [2206, 4, "Beleytia"],
                32: [2202, 3, "Rynotia"],
                33: [2203, 4, "Shanios"],
                34: [2208, 2, "Seraos"],
                35: [2209, 1, "Cheirios"],
                47: [2242, 2, "Swyndaios"],
                48: [2244, 4, "Chosios"],
                49: [2246, 2, "Jipios"],
                51: [1775, 3, "Loudios"],
                52: [1774, 2, "Rothytia"],
                54: [1785, 2, "Atheyos"],
                55: [1786, 1, "Querios"],
                58: [2269, 4, "Ghaeytia"],
                59: [2271, 2, "Jeyhios"],
                60: [2275, 1, "Boethaos"],
                61: [2276, 2, "Nalios"],
                68: [2925, 2, "Merios"],
                69: [2927, 4, "Dulios"],
                71: [2933, 3, "Nabios"],
                72: [2934, 4, "Tesaos"],
                79: [3676, 1, "Quabios"],
                80: [3679, 4, "Broshios"],
                86: [4359, 3, "Rupheios"],
                87: [4360, 4, "Dineos"],
                92: [5326, 2, "Ghaeos"],
                93: [5328, 4, "Ashatia"],
                94: [5330, 2, "Lerayos"],
                95: [5332, 4, "Seruios"],
                96: [5334, 2, "Tonitia"],
                98: [5544, 4, "Switaios"],
                99: [5546, 2, "Peroos"]
            },
            20: {
                2: [5439, 2, "Sigios"],
                3: [5438, 1, "Cletios"],
                5: [5161, 1, "Strowios"],
                6: [5159, 3, "Smezeos"],
                7: [5157, 1, "Fykios"],
                8: [5155, 3, "Tinotia"],
                11: [4793, 1, "Seroos"],
                12: [4791, 3, "Untiatia"],
                14: [4167, 1, "Dorios"],
                15: [4166, 4, "Brelaios"],
                17: [3528, 3, "Burauos"],
                18: [3526, 1, "Zyhiios"],
                20: [3536, 2, "Tinootia"],
                21: [3537, 1, "Stoiboos"],
                23: [2801, 1, "Quupios"],
                24: [2803, 3, "Naletia"],
                25: [2805, 1, "Nedyos"],
                27: [2814, 4, "Denietia"],
                28: [2815, 3, "Aughyos"],
                30: [2198, 2, "Toraios"],
                31: [2199, 3, "Drautia"],
                32: [2201, 2, "Quohios"],
                37: [1745, 3, "Baizios"],
                38: [1746, 2, "Vuifiios"],
                40: [1748, 2, "Chaoutia"],
                41: [1749, 4, "Nysutia"],
                42: [1752, 1, "Soerios"],
                44: [1760, 3, "Itiatia"],
                45: [1761, 2, "Smehios"],
                51: [1772, 4, "Quinios"],
                52: [1773, 1, "Chrisios"],
                54: [1783, 3, "Garitia"],
                55: [1784, 4, "Ormuos"],
                60: [2277, 3, "Oldoios"],
                61: [2278, 4, "Ciawuios"],
                63: [2284, 2, "Swoshiios"],
                64: [2285, 3, "Anitia"],
                65: [2288, 2, "Estoios"],
                66: [2289, 3, "Eroutia"],
                71: [2931, 1, "Dynios"],
                72: [2932, 2, "Phasios"],
                74: [2944, 3, "Tasoos"],
                75: [2946, 1, "Traesoios"],
                76: [2948, 3, "Smulios"],
                77: [2950, 1, "Shyotia"],
                79: [3677, 2, "Seraios"],
                80: [3678, 3, "Asheatia"],
                82: [3687, 1, "Buraetia"],
                83: [3688, 2, "Wuniios"],
                84: [3689, 3, "Dillaos"],
                86: [4361, 1, "Zhelios"],
                87: [4362, 2, "Siloos"],
                89: [4932, 1, "Skelatia"],
                90: [4934, 3, "Yereitia"],
                98: [5543, 3, "Woidyios"],
                99: [5545, 1, "Syniios"]
            },
            21: {
                2: [5441, 4, "Nusoios"],
                3: [5440, 3, "Leroetia"],
                5: [5160, 4, "Blyxios"],
                6: [5158, 2, "Nyytia"],
                7: [5156, 4, "Gesuios"],
                8: [5154, 2, "Ryneios"],
                10: [4787, 2, "Aughaos"],
                11: [4788, 3, "Blifios"],
                12: [4790, 2, "Kelitia"],
                17: [3527, 2, "Beyreios"],
                18: [3525, 4, "Llafios"],
                23: [2800, 4, "Pereatia"],
                24: [2802, 2, "Ingetia"],
                25: [2804, 4, "Teysios"],
                30: [2196, 4, "Swalios"],
                31: [2197, 1, "Thriegios"],
                32: [2200, 4, "Rilloios"],
                34: [1738, 3, "Tasaeos"],
                35: [1739, 4, "Viafios"],
                37: [1744, 4, "Sireos"],
                38: [1742, 1, "Stekaios"],
                39: [1743, 2, "Perauos"],
                40: [1747, 1, "Radiaos"],
                41: [1750, 3, "Ataeos"],
                42: [1751, 2, "Skeliatia"],
                44: [1758, 1, "Miheios"],
                45: [1759, 4, "Rudios"],
                46: [1764, 2, "Etoos"],
                47: [1765, 4, "Schidios"],
                49: [1768, 2, "Silyos"],
                50: [1769, 4, "Mietios"],
                51: [1771, 2, "Boikios"],
                54: [1780, 2, "Ardotia"],
                55: [1781, 1, "Zhurios"],
                57: [1797, 3, "Saeshoios"],
                58: [1796, 2, "Chaoeos"],
                60: [2279, 1, "Cleteos"],
                61: [2280, 2, "Chibios"],
                63: [2282, 4, "Bucios"],
                64: [2283, 1, "Baneyos"],
                65: [2286, 4, "Dreytuios"],
                66: [2287, 1, "Arios"],
                68: [2301, 1, "Osoos"],
                69: [2302, 3, "Lloruos"],
                74: [2943, 2, "Clyfiios"],
                75: [2945, 4, "Tasuos"],
                76: [2947, 2, "Yuhoos"],
                77: [2949, 4, "Bidios"],
                82: [3685, 3, "Dynotia"],
                83: [3686, 4, "Lerytia"],
                84: [3690, 1, "Smyhios"],
                86: [4363, 3, "Ormautia"],
                87: [4364, 4, "Lordaios"],
                89: [4931, 4, "Kimoios"],
                90: [4933, 2, "Misios"],
                91: [4935, 4, "Leroos"],
                92: [4937, 2, "Untietia"],
                94: [4940, 3, "Zikios"],
                95: [4942, 1, "Imootia"],
                96: [4943, 2, "Zhorios"],
                99: [5547, 4, "Kadios"],
                100: [5548, 3, "Maulios"]
            },
            22: {
                10: [4785, 4, "Weltuos"],
                11: [4786, 1, "Chodiios"],
                12: [4789, 4, "Ranietia"],
                14: [4165, 2, "Ranyos"],
                15: [4164, 1, "Swulios"],
                17: [3524, 3, "Swaishoios"],
                18: [3522, 1, "Smaeghiios"],
                20: [2798, 2, "Drorios"],
                21: [2799, 4, "Wutios"],
                27: [2190, 3, "Stilios"],
                28: [2191, 4, "Rayuos"],
                34: [1736, 1, "Tuneios"],
                35: [1737, 2, "Smennoos"],
                38: [1740, 3, "Dosaos"],
                39: [1741, 4, "Belautia"],
                44: [1754, 2, "Strisios"],
                45: [1755, 3, "Neydios"],
                46: [1762, 1, "Shyutia"],
                47: [1763, 3, "Rakytia"],
                49: [1766, 3, "Leitios"],
                50: [1767, 1, "Chreavios"],
                51: [1770, 3, "Ireeos"],
                53: [1776, 2, "Inaoutia"],
                54: [1778, 4, "Cleyhios"],
                55: [1782, 3, "Reudios"],
                57: [1795, 1, "Repaos"],
                58: [1794, 4, "Cybios"],
                65: [2290, 2, "Adios"],
                66: [2291, 3, "Vulios"],
                68: [2299, 2, "Denautia"],
                69: [2300, 4, "Laistoos"],
                71: [2307, 3, "Rayotia"],
                72: [2308, 4, "Dareytia"],
                74: [2940, 3, "Vesatia"],
                75: [2942, 1, "Zeyuos"],
                79: [2957, 1, "Fuirios"],
                80: [2958, 2, "Lenuios"],
                82: [3683, 1, "Paxaios"],
                83: [3684, 2, "Beleatia"],
                91: [4936, 1, "Banitia"],
                92: [4938, 3, "Hoqios"],
                94: [4939, 2, "Vesytia"],
                95: [4941, 4, "Pemios"],
                96: [4944, 3, "Nathaios"],
                97: [4945, 4, "Whisoos"],
                99: [5549, 2, "Toraos"],
                100: [5550, 1, "Sysios"]
            },
            23: {
                3: [5149, 3, "Oldutia"],
                4: [5150, 4, "Osyos"],
                5: [5153, 3, "Rauntuos"],
                7: [4783, 3, "Loitios"],
                8: [4784, 1, "Taietia"],
                14: [4162, 3, "Wirios"],
                15: [4163, 4, "Ightitia"],
                17: [3523, 2, "Oriaos"],
                18: [3521, 4, "Ashaos"],
                20: [2797, 1, "Hatoutia"],
                21: [2795, 3, "Nysytia"],
                22: [2796, 4, "Zaerios"],
                24: [2195, 1, "Ruceos"],
                25: [2192, 2, "Chakyios"],
                27: [2188, 1, "Hataytia"],
                28: [2189, 2, "Taelios"],
                30: [1726, 3, "Teroios"],
                31: [1727, 4, "Laruos"],
                33: [1730, 3, "Ustuios"],
                34: [1731, 4, "Ackeetia"],
                35: [1734, 3, "Ackitia"],
                36: [1735, 4, "Fihios"],
                41: [1264, 2, "Nuitiios"],
                42: [1265, 1, "Pasheios"],
                44: [1753, 1, "Throsios"],
                45: [1757, 4, "Loorios"],
                53: [1777, 3, "Sayoos"],
                54: [1779, 1, "Yaloios"],
                57: [1793, 3, "Horeos"],
                58: [1792, 2, "Hysios"],
                60: [1800, 3, "Elmeetia"],
                61: [1801, 4, "Echootia"],
                62: [1804, 3, "Gopoios"],
                63: [1805, 4, "Sianios"],
                65: [2292, 1, "Sieyios"],
                66: [2293, 4, "Risaios"],
                68: [2297, 3, "Taieyos"],
                69: [2298, 2, "Nynaos"],
                70: [2305, 1, "Strintaios"],
                71: [2306, 2, "Lykios"],
                72: [2309, 1, "Ormeutia"],
                74: [2939, 2, "Dekios"],
                75: [2941, 4, "Doumios"],
                77: [2952, 4, "Ildeos"],
                78: [2954, 2, "Eldaos"],
                79: [2956, 4, "Emaetia"],
                80: [2959, 3, "Koodaios"],
                82: [3681, 3, "Houlios"],
                83: [3682, 4, "Styrios"],
                85: [3701, 2, "Suleaos"],
                86: [3702, 3, "Essaos"],
                88: [4369, 2, "Diloios"],
                89: [4370, 3, "Engotia"],
                96: [4947, 2, "Heugyios"],
                97: [4946, 1, "Pauriios"]
            },
            24: {
                2: [5147, 1, "Eretia"],
                3: [5148, 2, "Veretia"],
                4: [5151, 1, "Rheuleos"],
                5: [5152, 2, "Thesyios"],
                7: [4782, 2, "Draoos"],
                8: [4775, 4, "Doinios"],
                9: [4777, 2, "Turuos"],
                10: [4779, 4, "Weynios"],
                11: [4780, 1, "Thriexios"],
                13: [4160, 1, "Choisoos"],
                14: [4161, 2, "Dareyos"],
                21: [2793, 1, "Solios"],
                22: [2794, 2, "Luiwiios"],
                24: [2193, 3, "Dyneuos"],
                25: [2194, 4, "Velios"],
                26: [2186, 3, "Lalios"],
                27: [2187, 4, "Ketheos"],
                30: [1724, 1, "Ereatia"],
                31: [1725, 2, "Clielyios"],
                33: [1728, 1, "Riliaos"],
                34: [1729, 2, "Tiaoutia"],
                35: [1732, 1, "Zumoos"],
                36: [1733, 2, "Chradoios"],
                38: [1253, 1, "Thikaios"],
                39: [1254, 2, "Phyfuos"],
                41: [1266, 4, "Oughetia"],
                42: [1263, 3, "Oldeitia"],
                47: [1274, 4, "Rilootia"],
                48: [1275, 1, "Etotia"],
                50: [1285, 2, "Beluos"],
                51: [1288, 4, "Seukios"],
                56: [1787, 1, "Swialtuos"],
                57: [1790, 4, "Thrudios"],
                58: [1791, 1, "Atietia"],
                60: [1798, 1, "Hohios"],
                61: [1799, 2, "Tucios"],
                62: [1802, 1, "Nynaios"],
                63: [1803, 2, "Whelyos"],
                68: [2295, 4, "Sayhios"],
                69: [2296, 1, "Loidios"],
                70: [2303, 3, "Kifios"],
                71: [2304, 4, "Nalutia"],
                77: [2951, 3, "Luyoios"],
                78: [2953, 1, "Mendoos"],
                79: [2955, 3, "Ightotia"],
                85: [3700, 1, "Crenios"],
                86: [3703, 4, "Whaedios"],
                88: [4367, 4, "Shyaos"],
                89: [4368, 1, "Loeleios"],
                90: [4371, 4, "Queatia"],
                91: [4372, 1, "Jesyos"],
                93: [4384, 4, "Locyos"],
                94: [4386, 2, "Furios"],
                99: [4958, 3, "Diacios"],
                100: [4959, 1, "Honatia"]
            },
            25: {
                1: [5146, 4, "Slasios"],
                2: [5145, 3, "Cluchoios"],
                8: [4774, 3, "Lyeautia"],
                9: [4776, 1, "Veyios"],
                10: [4778, 3, "Fayleios"],
                11: [4781, 2, "Dreijaios"],
                13: [4159, 3, "Drygios"],
                14: [4158, 4, "Treicios"],
                16: [3520, 3, "Radytia"],
                17: [3519, 2, "Skelooos"],
                18: [3518, 1, "Whaesios"],
                20: [2791, 3, "Chaeitia"],
                21: [2792, 4, "Caniios"],
                26: [2184, 1, "Nainios"],
                27: [2185, 2, "Shyoos"],
                29: [1722, 3, "Sipaos"],
                30: [1723, 4, "Schanios"],
                38: [1251, 3, "Kimyos"],
                39: [1252, 4, "Cicios"],
                41: [1257, 1, "Ighteuos"],
                42: [1258, 2, "Clobios"],
                43: [1261, 1, "Soorios"],
                44: [1262, 2, "Undatia"],
                46: [1272, 2, "Nalaitia"],
                47: [1273, 3, "Vesaetia"],
                48: [1276, 2, "Suhoos"],
                50: [1286, 1, "Chroilduos"],
                51: [1287, 3, "Waupios"],
                52: [1289, 1, "Risytia"],
                53: [1292, 3, "Anayos"],
                54: [1298, 1, "Smiemios"],
                56: [1788, 2, "Whoebios"],
                57: [1789, 3, "Lexios"],
                65: [1324, 3, "Hahios"],
                66: [1325, 4, "Saytios"],
                73: [2318, 1, "Hineatia"],
                74: [2319, 4, "Worutia"],
                81: [2960, 2, "Pabiios"],
                82: [2962, 4, "Slayhios"],
                84: [3691, 4, "Poluos"],
                85: [3693, 2, "Blirios"],
                88: [4365, 2, "Tonieos"],
                89: [4366, 3, "Lurios"],
                90: [4373, 2, "Heseios"],
                91: [4374, 3, "Yerayos"],
                93: [4383, 3, "Quarios"],
                94: [4385, 1, "Shyetia"],
                96: [4948, 2, "Troebaios"],
                97: [4950, 4, "Phejyios"],
                98: [4952, 2, "Liadoios"],
                99: [4954, 4, "Ceraios"],
                100: [4956, 2, "Usteitia"]
            },
            26: {
                1: [5144, 2, "Ildyos"],
                2: [5143, 1, "Eteos"],
                4: [4773, 4, "Uskietia"],
                5: [4769, 1, "Chaytia"],
                6: [4770, 4, "Doovios"],
                16: [3516, 1, "Chycios"],
                17: [3515, 4, "Weukios"],
                18: [3517, 3, "Creiqaos"],
                20: [2789, 1, "Llocoios"],
                21: [2790, 2, "Wareatia"],
                23: [2183, 3, "Soehios"],
                24: [2181, 1, "Tulios"],
                29: [1720, 1, "Towaios"],
                30: [1721, 2, "Ormayos"],
                32: [1243, 2, "Rakeitia"],
                33: [1246, 1, "Nadyos"],
                35: [1240, 2, "Pokeios"],
                36: [1241, 1, "Kaluios"],
                38: [1250, 2, "Wheteios"],
                39: [1249, 1, "Omuos"],
                41: [1255, 3, "Achatia"],
                42: [1256, 4, "Wahaos"],
                43: [1259, 3, "Aneuos"],
                44: [1260, 4, "Rasios"],
                46: [1269, 3, "Chritiios"],
                47: [1271, 1, "Quaitia"],
                52: [1290, 2, "Naloos"],
                53: [1291, 4, "Novios"],
                54: [1297, 2, "Vereios"],
                59: [1310, 1, "Veroos"],
                60: [1311, 2, "Peraos"],
                62: [1314, 1, "Noxoos"],
                63: [1315, 2, "Yeighios"],
                64: [1318, 1, "Maendaos"],
                65: [1319, 2, "Chricios"],
                66: [1326, 1, "Taygios"],
                68: [1812, 2, "Dadios"],
                69: [1813, 3, "Rileytia"],
                71: [2310, 3, "Swesios"],
                72: [2313, 2, "Zelios"],
                73: [2314, 3, "Delaytia"],
                74: [2317, 2, "Dayrios"],
                76: [2321, 2, "Dyrreios"],
                77: [2323, 4, "Lusheos"],
                78: [2325, 2, "Whotios"],
                79: [2327, 4, "Zagios"],
                81: [2961, 1, "Lyeuos"],
                82: [2963, 3, "Weunios"],
                84: [3692, 1, "Nyseos"],
                85: [3694, 3, "Sobios"],
                86: [3704, 1, "Kounios"],
                93: [4382, 2, "Breulios"],
                94: [4380, 4, "Rubeios"],
                96: [4949, 3, "Bisios"],
                97: [4951, 1, "Hotios"],
                98: [4953, 3, "Sarios"],
                99: [4955, 1, "Nuifios"],
                100: [4957, 3, "Chaatia"]
            },
            27: {
                4: [4772, 3, "Blalios"],
                5: [4768, 2, "Toudoios"],
                6: [4771, 3, "Shoocios"],
                8: [4157, 2, "Onayos"],
                9: [4156, 1, "Crokios"],
                10: [4151, 4, "Rildiios"],
                11: [4150, 3, "Tewios"],
                12: [4149, 2, "Zhyyios"],
                13: [4148, 1, "Cehyos"],
                15: [3513, 4, "Rouluos"],
                16: [3512, 3, "Miliios"],
                17: [3514, 2, "Achoos"],
                23: [2182, 2, "Woretia"],
                24: [2180, 4, "Fiyios"],
                26: [1718, 2, "Phynaos"],
                27: [1719, 1, "Fusios"],
                32: [1234, 4, "Zhowios"],
                33: [1235, 3, "Sidios"],
                34: [1238, 4, "Ruhoos"],
                35: [1239, 3, "Naysios"],
                36: [1242, 4, "Selios"],
                38: [1247, 3, "Cogiios"],
                39: [1248, 4, "Thonios"],
                46: [1268, 2, "Claesios"],
                47: [1270, 4, "Slyrios"],
                49: [1283, 1, "Stredios"],
                50: [1284, 4, "Briruios"],
                53: [1293, 3, "Hithios"],
                54: [1296, 1, "Geewoos"],
                56: [1302, 3, "Beawoios"],
                57: [1303, 4, "Nyseetia"],
                58: [1306, 3, "Pereytia"],
                59: [1305, 4, "Danios"],
                60: [1309, 3, "Nisiios"],
                62: [1312, 3, "Sigeios"],
                63: [1313, 4, "Kimatia"],
                64: [1316, 3, "Blialuios"],
                65: [1317, 4, "Mosaitia"],
                68: [1810, 4, "Gakios"],
                69: [1811, 1, "Whiagios"],
                71: [2311, 4, "Nyvios"],
                72: [2312, 1, "Cheeos"],
                73: [2315, 4, "Asuos"],
                74: [2316, 1, "Ataetia"],
                76: [2320, 1, "Gaylios"],
                77: [2322, 3, "Yeroeos"],
                78: [2324, 1, "Cesios"],
                79: [2326, 3, "Nekios"],
                81: [2964, 2, "Coyeos"],
                82: [2966, 4, "Llaleos"],
                84: [3695, 4, "Swevaios"],
                85: [3696, 2, "Echeytia"],
                86: [3699, 4, "Ladeos"],
                88: [3706, 3, "Daemiios"],
                89: [3708, 1, "Brylios"],
                90: [3710, 3, "Cahios"],
                91: [3712, 1, "Lleeyios"],
                93: [4381, 1, "Smixios"],
                94: [4379, 3, "Kemios"]
            },
            28: {
                1: [4762, 4, "Finoos"],
                2: [4763, 2, "Ruvyos"],
                5: [4766, 4, "Beinios"],
                6: [4767, 1, "Bocaios"],
                8: [4155, 4, "Brobyos"],
                9: [4154, 3, "Likaios"],
                10: [4153, 2, "Issietia"],
                11: [4152, 1, "Kazoios"],
                12: [4147, 4, "Lissaos"],
                13: [4145, 3, "Denoios"],
                15: [3511, 2, "Swetios"],
                16: [3510, 1, "Keloios"],
                19: [2788, 1, "Lieyios"],
                20: [2786, 2, "Mureos"],
                21: [2787, 3, "Juroios"],
                23: [2179, 3, "Filaios"],
                24: [2177, 1, "Rakoios"],
                26: [1717, 3, "Clizios"],
                27: [1715, 4, "Dopyios"],
                28: [1714, 3, "Zaujios"],
                29: [1711, 4, "Rhoesios"],
                30: [1710, 3, "Taweios"],
                32: [1232, 1, "Yamaios"],
                33: [1233, 2, "Hateutia"],
                34: [1236, 1, "Awutia"],
                35: [1237, 2, "Quouheios"],
                41: [913, 4, "Queootia"],
                42: [912, 2, "Neyios"],
                43: [920, 4, "Kimeutia"],
                44: [922, 3, "Laiyios"],
                49: [1277, 2, "Zhieyios"],
                50: [1280, 3, "Ryneatia"],
                51: [1282, 4, "Quanios"],
                53: [1294, 2, "Namiios"],
                54: [1295, 4, "Shyatia"],
                56: [1300, 1, "Ciessyios"],
                57: [1301, 2, "Saysuos"],
                58: [1304, 1, "Rhenoos"],
                59: [1307, 2, "Asoetia"],
                60: [1308, 1, "Zharios"],
                65: [1320, 3, "Gutios"],
                66: [1323, 2, "Blouseos"],
                68: [1808, 2, "Roohoios"],
                69: [1809, 3, "Schosios"],
                81: [2965, 1, "Keloos"],
                82: [2967, 3, "Hebios"],
                85: [3697, 1, "Tulyios"],
                86: [3698, 3, "Ireos"],
                88: [3705, 2, "Bririos"],
                89: [3707, 4, "Sneesios"],
                90: [3709, 2, "Onieos"],
                91: [3711, 4, "Ceirios"],
                93: [4376, 2, "Endoos"],
                94: [4378, 4, "Chrofiios"],
                96: [4397, 2, "Dojyos"],
                97: [4399, 4, "Phauhyios"],
                99: [4960, 1, "Lenios"],
                100: [4961, 4, "Cleyrios"]
            },
            29: {
                1: [4761, 3, "Quaoutia"],
                2: [4760, 1, "Snoqaos"],
                3: [4758, 4, "Rodeytia"],
                5: [4764, 2, "Lleyios"],
                6: [4765, 3, "Poineios"],
                18: [2782, 2, "Tedoos"],
                19: [2783, 3, "Thraylios"],
                20: [2784, 4, "Riluos"],
                21: [2785, 1, "Honayos"],
                23: [2178, 2, "Lliaruios"],
                24: [2176, 4, "Enaeos"],
                26: [1716, 1, "Leiboios"],
                27: [1713, 2, "Newios"],
                28: [1712, 1, "Tykeos"],
                29: [1709, 2, "Aduos"],
                30: [1708, 1, "Oreos"],
                37: [906, 3, "Noimios"],
                38: [905, 4, "Shufios"],
                40: [910, 2, "Ustoos"],
                41: [909, 1, "Clarios"],
                42: [911, 3, "Onaytia"],
                43: [919, 1, "Imeos"],
                44: [921, 2, "Breroos"],
                46: [638, 3, "Leihios"],
                47: [637, 2, "Rexios"],
                49: [1278, 4, "Rayaetia"],
                50: [1279, 1, "Woreytia"],
                51: [1281, 2, "Runtuos"],
                62: [961, 4, "Rodatia"],
                63: [963, 2, "Pheryos"],
                65: [1321, 4, "Seeseios"],
                66: [1322, 1, "Lleetios"],
                68: [1806, 4, "Urnios"],
                69: [1807, 1, "Kakiios"],
                70: [1816, 2, "Churios"],
                71: [1817, 3, "Kinyos"],
                73: [1829, 2, "Dacios"],
                74: [1827, 1, "Uskiaos"],
                75: [1828, 2, "Tudios"],
                77: [2328, 4, "Deraios"],
                78: [2330, 2, "Ciekyios"],
                79: [2332, 4, "Hechaos"],
                82: [2968, 2, "Mureios"],
                83: [2969, 1, "Omoos"],
                90: [3713, 1, "Stoezios"],
                91: [3714, 3, "Seycuos"],
                93: [4375, 3, "Nihios"],
                94: [4377, 1, "Ilditia"],
                96: [4396, 1, "Enthouos"],
                97: [4398, 3, "Drerroos"],
                99: [4963, 2, "Inaoitia"],
                100: [4962, 3, "Uskaeos"]
            },
            30: {
                2: [4759, 2, "Jiltyios"],
                3: [4757, 3, "Smilios"],
                8: [4143, 2, "Angatia"],
                9: [4142, 1, "Whilios"],
                11: [3509, 4, "Quetaios"],
                12: [3506, 1, "Rodeos"],
                13: [3507, 2, "Smiatoos"],
                15: [2778, 4, "Denuos"],
                16: [2779, 3, "Adaeos"],
                18: [2780, 4, "Inaooos"],
                19: [2781, 1, "Neraios"],
                32: [1224, 2, "Drichuos"],
                33: [1223, 1, "Whebios"],
                35: [902, 4, "Rothoitia"],
                36: [901, 3, "Hainios"],
                37: [904, 1, "Rodyios"],
                38: [903, 2, "Ronios"],
                40: [908, 4, "Nenaos"],
                41: [907, 3, "Loutuios"],
                46: [635, 4, "Quowios"],
                47: [636, 1, "Rieteios"],
                53: [937, 1, "Rehios"],
                54: [938, 3, "Treiluos"],
                56: [940, 4, "Clicuios"],
                57: [942, 2, "Strilteios"],
                59: [951, 2, "Moroetia"],
                60: [950, 4, "Linaios"],
                62: [960, 3, "Kupios"],
                63: [962, 1, "Ereos"],
                70: [1814, 4, "Lyeayos"],
                71: [1815, 1, "Issieos"],
                73: [2294, 4, "Zeunoios"],
                74: [1825, 3, "Tonatia"],
                75: [1826, 4, "Shyrios"],
                77: [2329, 1, "Kimaos"],
                78: [2331, 3, "Iaeetia"],
                79: [2333, 1, "Phessuos"],
                80: [2340, 4, "Anutia"],
                82: [2971, 3, "Ledyios"],
                83: [2972, 4, "Rocios"],
                85: [2980, 4, "Tiaeetia"],
                86: [2982, 2, "Troneios"],
                87: [2987, 1, "Rifios"],
                88: [2989, 3, "Wareos"],
                96: [4393, 2, "Chrumuios"],
                97: [4395, 4, "Hinetia"],
                99: [4964, 1, "Musuios"],
                100: [4965, 4, "Patiios"]
            },
            31: {
                2: [4755, 1, "Phopios"],
                3: [4752, 4, "Whetios"],
                5: [4144, 2, "Cihios"],
                6: [4139, 4, "Tryltaios"],
                7: [4138, 1, "Lorytia"],
                8: [4140, 3, "Scheinios"],
                9: [4141, 4, "Undauos"],
                11: [3508, 2, "Endayos"],
                12: [3504, 3, "Aldauos"],
                13: [3505, 4, "Chorios"],
                15: [2777, 2, "Shunios"],
                16: [2776, 1, "Imayos"],
                21: [2171, 3, "Zorios"],
                22: [2169, 1, "Tiautia"],
                23: [2167, 3, "Thouhios"],
                24: [2165, 1, "Quoudios"],
                26: [1707, 4, "Beimyos"],
                27: [1706, 3, "Thrauzoos"],
                29: [1231, 1, "Recios"],
                30: [1229, 4, "Sossyos"],
                31: [1227, 3, "Neyduos"],
                32: [1225, 4, "Veuweos"],
                33: [1222, 3, "Quaeeos"],
                35: [900, 2, "Whassios"],
                36: [899, 1, "Clecios"],
                43: [622, 2, "Gacios"],
                44: [623, 4, "Enytia"],
                47: [634, 3, "Arditia"],
                48: [633, 2, "Kelios"],
                49: [632, 1, "Gapios"],
                51: [932, 4, "Osutia"],
                52: [934, 1, "Onetia"],
                53: [936, 4, "Trafiios"],
                54: [939, 2, "Skelutia"],
                56: [941, 1, "Kelytia"],
                57: [943, 3, "Imaos"],
                58: [944, 4, "Surios"],
                59: [947, 3, "Reimyios"],
                60: [949, 1, "Shoedyos"],
                62: [953, 4, "Iaetia"],
                63: [955, 2, "Quesaios"],
                64: [957, 4, "Houjios"],
                65: [959, 2, "Anytia"],
                67: [1327, 3, "Tyseios"],
                68: [1330, 2, "Traguos"],
                73: [1824, 2, "Queesaios"],
                74: [1823, 1, "Mokios"],
                79: [2334, 2, "Nosios"],
                80: [2335, 3, "Iseetia"],
                82: [2973, 1, "Kaleutia"],
                83: [2974, 2, "Zodios"],
                85: [2979, 1, "Smerios"],
                86: [2981, 3, "Sameetia"],
                87: [2986, 4, "Boshuios"],
                88: [2988, 2, "Schezios"],
                90: [3715, 4, "Vesyos"],
                91: [3717, 2, "Meydeios"],
                92: [3725, 1, "Phayfios"],
                94: [4387, 3, "Denutia"],
                95: [4389, 2, "Waritia"],
                96: [4392, 1, "Blildiios"],
                97: [4394, 3, "Jyvios"],
                99: [4967, 2, "Untotia"],
                100: [4966, 3, "Rafaios"]
            },
            32: {
                2: [4756, 2, "Strayyios"],
                3: [4751, 3, "Sweedios"],
                5: [4136, 1, "Shazyos"],
                6: [4135, 3, "Chrynios"],
                7: [4137, 2, "Chrywios"],
                12: [3502, 1, "Dyneyos"],
                13: [3503, 2, "Elmaytia"],
                15: [2772, 3, "Drauitia"],
                16: [2773, 4, "Inaitia"],
                17: [2775, 3, "Wesios"],
                19: [2174, 2, "Nesuos"],
                20: [2172, 4, "Osotia"],
                21: [2170, 2, "Stonyios"],
                22: [2168, 4, "Deehios"],
                23: [2166, 2, "Kelyos"],
                24: [2164, 4, "Sayxios"],
                26: [1704, 1, "Dealios"],
                27: [1705, 2, "Piciios"],
                29: [1230, 3, "Oughyos"],
                30: [1228, 2, "Rookios"],
                31: [1226, 1, "Clocoos"],
                32: [1221, 2, "Dreakios"],
                33: [1220, 1, "Syfios"],
                35: [898, 4, "Inaaios"],
                36: [897, 3, "Awaios"],
                38: [608, 1, "Enoutia"],
                39: [609, 2, "Doraos"],
                40: [614, 4, "Sauriios"],
                41: [616, 2, "Rynoos"],
                43: [621, 1, "Iauos"],
                44: [624, 3, "Phoimios"],
                45: [626, 2, "Saerios"],
                47: [629, 2, "Whoiseios"],
                48: [630, 3, "Raditia"],
                49: [631, 4, "Tineatia"],
                51: [931, 3, "Lainios"],
                52: [933, 2, "Worauos"],
                53: [935, 3, "Ralaos"],
                58: [945, 1, "Treytios"],
                59: [946, 2, "Ingaos"],
                60: [948, 4, "Leebios"],
                62: [952, 3, "Ustauos"],
                63: [954, 1, "Saulios"],
                64: [956, 3, "Stuisios"],
                65: [958, 1, "Ightiatia"],
                67: [1328, 4, "Javios"],
                68: [1329, 1, "Cuiwios"],
                69: [1331, 3, "Lavios"],
                70: [1334, 2, "Swoovyos"],
                72: [1820, 2, "Reuxios"],
                73: [1821, 3, "Hiassuios"],
                74: [1822, 4, "Shaedios"],
                76: [1840, 4, "Slunios"],
                77: [1841, 1, "Thausios"],
                79: [2336, 4, "Neveos"],
                80: [2337, 1, "Bytoios"],
                85: [2976, 2, "Gussaos"],
                86: [2978, 4, "Kinoos"],
                90: [3716, 1, "Oldouos"],
                91: [3718, 3, "Isseyos"],
                92: [3726, 4, "Vodios"],
                94: [4390, 1, "Criejios"],
                95: [4391, 4, "Gokios"]
            },
            33: {
                5: [4134, 4, "Tutyios"],
                6: [4133, 2, "Zhesuios"],
                9: [3501, 3, "Sosios"],
                10: [3500, 4, "Nenduos"],
                15: [2770, 1, "Kelaytia"],
                16: [2771, 2, "Besios"],
                17: [2774, 1, "Garauos"],
                19: [2175, 3, "Seicaos"],
                20: [2173, 1, "Bysios"],
                26: [1703, 4, "Emuitia"],
                27: [1702, 3, "Ildatia"],
                32: [1218, 3, "Yurios"],
                33: [1219, 4, "Taioos"],
                35: [896, 2, "Paisaios"],
                36: [895, 1, "Lyeios"],
                38: [606, 3, "Reicios"],
                39: [607, 4, "Peryos"],
                40: [610, 3, "Ildaos"],
                41: [615, 1, "Yeusios"],
                43: [618, 2, "Bontaos"],
                44: [620, 4, "Rekoios"],
                45: [625, 1, "Ingatia"],
                47: [627, 4, "Slauniios"],
                48: [628, 1, "Brairaos"],
                55: [397, 4, "Coneios"],
                56: [396, 2, "Naleatia"],
                69: [1332, 4, "Whullios"],
                70: [1333, 1, "Ghaauos"],
                72: [1818, 4, "Jolios"],
                73: [1819, 1, "Piabios"],
                76: [1839, 3, "Clofios"],
                77: [1842, 2, "Stunoios"],
                79: [2338, 2, "Hatyos"],
                80: [2339, 3, "Naukios"],
                82: [2341, 3, "Swoujios"],
                83: [2343, 1, "Tasotia"],
                85: [2975, 1, "Traitios"],
                86: [2977, 3, "Sipios"],
                87: [2984, 2, "Yoiguios"],
                89: [3723, 4, "Rothaetia"],
                90: [3721, 2, "Cesaios"],
                91: [3719, 4, "Tefios"],
                97: [4407, 2, "Divyios"],
                98: [4408, 3, "Loruitia"]
            },
            34: {
                2: [4131, 1, "Quevios"],
                3: [4130, 4, "Blemios"],
                8: [3497, 4, "Judoios"],
                9: [3498, 1, "Snuxios"],
                10: [3499, 2, "Teelios"],
                12: [2768, 3, "Raneios"],
                13: [2769, 1, "Zhibaios"],
                22: [2163, 1, "Kimuios"],
                23: [2162, 4, "Snoinios"],
                25: [1699, 4, "Woroutia"],
                26: [1700, 1, "Ladyos"],
                27: [1701, 2, "Osetia"],
                29: [1216, 4, "Wuitios"],
                30: [1217, 1, "Quousios"],
                43: [617, 1, "Vairaios"],
                44: [619, 3, "Ustitia"],
                50: [385, 1, "Crecaios"],
                51: [384, 2, "Lahios"],
                53: [395, 1, "Aroitia"],
                54: [394, 3, "Viyios"],
                55: [393, 1, "Sifios"],
                56: [392, 3, "Scheyreos"],
                58: [399, 2, "Queutia"],
                59: [401, 4, "Snoilios"],
                60: [412, 1, "Daihios"],
                61: [415, 4, "Yaybeos"],
                63: [655, 2, "Chreivuos"],
                64: [656, 3, "Kerios"],
                66: [964, 3, "Waraos"],
                67: [967, 2, "Roopaios"],
                75: [1832, 4, "Babios"],
                76: [1835, 1, "Draaos"],
                82: [2342, 4, "Strucios"],
                83: [2344, 2, "Ingeitia"],
                86: [2983, 4, "Kaihios"],
                87: [2985, 1, "Lotios"],
                89: [3724, 1, "Taucios"],
                90: [3722, 3, "Sneylios"],
                91: [3720, 1, "Thannios"],
                93: [3727, 4, "Brustoos"],
                94: [3729, 2, "Broriios"],
                96: [4404, 3, "Tayyos"],
                97: [4405, 4, "Sucoos"],
                98: [4406, 1, "Quaesios"]
            },
            35: {
                2: [4132, 2, "Enthoitia"],
                3: [4129, 3, "Rakaios"],
                4: [4127, 1, "Rhoigoios"],
                5: [4128, 2, "Estaos"],
                7: [3496, 3, "Omeos"],
                8: [3495, 2, "Blailios"],
                12: [2763, 2, "Moosios"],
                13: [2761, 4, "Criebios"],
                14: [2759, 2, "Kucoios"],
                15: [2757, 4, "Blygios"],
                17: [2755, 4, "Chroirdeos"],
                18: [2753, 1, "Hateitia"],
                20: [2158, 4, "Clidios"],
                21: [2159, 1, "Crizios"],
                22: [2160, 2, "Creziios"],
                23: [2161, 3, "Zinios"],
                25: [1698, 3, "Stofios"],
                26: [1697, 2, "Nysayos"],
                29: [1215, 3, "Dustoos"],
                30: [1214, 2, "Ageeios"],
                32: [890, 1, "Ageoutia"],
                33: [889, 4, "Tantuios"],
                34: [892, 3, "Sholios"],
                35: [894, 1, "Entheetia"],
                37: [604, 4, "Kimayos"],
                38: [605, 1, "Lauroos"],
                40: [366, 1, "Lyeotia"],
                41: [367, 2, "Trauviios"],
                46: [375, 4, "Ranooos"],
                47: [376, 2, "Trianios"],
                49: [380, 3, "Samiatia"],
                50: [381, 4, "Beumios"],
                51: [383, 3, "Tezios"],
                53: [388, 2, "Vazeos"],
                54: [389, 4, "Chelios"],
                55: [390, 2, "Zhanios"],
                56: [391, 4, "Nuibios"],
                58: [398, 1, "Sloxeos"],
                59: [400, 3, "Laetios"],
                60: [413, 2, "Covios"],
                61: [414, 3, "Cheyos"],
                63: [652, 4, "Rhaudios"],
                64: [653, 1, "Roesios"],
                66: [965, 4, "Schokaios"],
                67: [966, 1, "Emeitia"],
                68: [970, 3, "Meikaios"],
                70: [1335, 1, "Bayhios"],
                71: [1337, 3, "Tasyos"],
                72: [1399, 1, "Vesieos"],
                73: [1401, 3, "Leyvios"],
                75: [1833, 2, "Essetia"],
                76: [1834, 3, "Rouzios"],
                77: [1838, 2, "Snafios"],
                79: [1843, 2, "Naruios"],
                80: [1845, 4, "Eldyos"],
                83: [2345, 3, "Toreeos"],
                84: [2347, 1, "Nuchoios"],
                93: [3728, 1, "Wareios"],
                94: [3730, 3, "Rakios"],
                96: [4402, 1, "Thryzios"],
                97: [4403, 2, "Jaekeios"]
            },
            36: {
                4: [4126, 4, "Sesios"],
                5: [4125, 3, "Tekios"],
                7: [3494, 1, "Quuwios"],
                8: [3493, 4, "Chisios"],
                10: [2766, 1, "Taetios"],
                11: [2764, 3, "Zhesaos"],
                12: [2762, 1, "Echeitia"],
                13: [2760, 3, "Ninoos"],
                14: [2758, 1, "Aughaitia"],
                15: [2756, 3, "Kucios"],
                17: [2754, 3, "Eneitia"],
                18: [2752, 2, "Lijios"],
                20: [2156, 2, "Engyos"],
                21: [2157, 3, "Burutia"],
                28: [1213, 1, "Honetia"],
                29: [1212, 4, "Nyouos"],
                32: [888, 3, "Clauzaios"],
                33: [887, 2, "Joisios"],
                34: [891, 4, "Deneios"],
                35: [893, 2, "Duneios"],
                37: [597, 3, "Emuios"],
                38: [596, 2, "Reerios"],
                40: [365, 3, "Urneos"],
                41: [363, 4, "Doruios"],
                42: [364, 3, "Quayios"],
                44: [372, 1, "Zilios"],
                45: [373, 2, "Shyroos"],
                46: [374, 3, "Yeebiios"],
                47: [377, 1, "Romios"],
                49: [378, 1, "Coogeios"],
                50: [379, 2, "Scheykios"],
                51: [382, 1, "Shobaios"],
                53: [386, 1, "Eldios"],
                54: [387, 3, "Chramaos"],
                63: [650, 3, "Echoos"],
                64: [654, 2, "Thrygios"],
                67: [968, 2, "Echaetia"],
                68: [969, 4, "Crohios"],
                70: [1336, 2, "Estietia"],
                71: [1338, 4, "Scholoios"],
                72: [1400, 2, "Skelytia"],
                73: [1402, 4, "Naseios"],
                76: [1836, 4, "Enthietia"],
                77: [1837, 1, "Asayos"],
                79: [1844, 1, "Ceihoos"],
                80: [1846, 3, "Belutia"],
                81: [1851, 1, "Phaiwios"],
                83: [2346, 4, "Stristoios"],
                84: [2348, 2, "Roreos"],
                86: [2990, 3, "Kawaios"],
                87: [2992, 2, "Sanoios"],
                88: [2994, 3, "Lerios"],
                89: [2996, 1, "Necios"],
                90: [2998, 4, "Drycios"],
                92: [3733, 2, "Onoos"],
                93: [3731, 4, "Loikios"],
                94: [3735, 2, "Smewios"],
                96: [4400, 3, "Ingyos"],
                97: [4401, 4, "Jodios"],
                99: [4425, 3, "Brikyios"],
                100: [4426, 4, "Oneos"]
            },
            37: {
                1: [4746, 2, "Werios"],
                2: [4745, 4, "Nysaos"],
                4: [4124, 2, "Loretia"],
                5: [4123, 1, "Llamios"],
                7: [3492, 3, "Laelios"],
                8: [3491, 2, "Estyos"],
                10: [2767, 2, "Wootios"],
                11: [2765, 4, "Acheytia"],
                17: [2751, 1, "Foifios"],
                18: [2750, 4, "Eldooos"],
                20: [2154, 4, "Ustoeos"],
                21: [2155, 1, "Bothuos"],
                23: [1696, 4, "Taiuos"],
                24: [1694, 2, "Lienios"],
                25: [1692, 4, "Undoios"],
                26: [1690, 2, "Riloitia"],
                28: [1210, 3, "Atotia"],
                29: [1211, 2, "Iteitia"],
                31: [886, 1, "Enthooos"],
                32: [885, 4, "Lopaios"],
                37: [595, 1, "Gyrios"],
                38: [594, 4, "Delytia"],
                41: [362, 1, "Swoyuos"],
                42: [361, 2, "Adaytia"],
                44: [371, 4, "Noupeios"],
                45: [370, 3, "Lodios"],
                56: [204, 2, "Chrosios"],
                57: [205, 1, "Feraos"],
                59: [416, 2, "Stroerdoios"],
                60: [418, 1, "Brarios"],
                62: [639, 3, "Rosios"],
                63: [641, 1, "Iseos"],
                64: [647, 4, "Jastaos"],
                65: [648, 1, "Hekyos"],
                67: [971, 3, "Bukios"],
                68: [972, 1, "Strifios"],
                73: [1403, 1, "Leukaos"],
                74: [1405, 2, "Chroeyiios"],
                79: [1847, 2, "Rubuos"],
                80: [1849, 4, "Sinios"],
                81: [1852, 2, "Reizios"],
                86: [2991, 4, "Kunnoos"],
                87: [2993, 1, "Aweos"],
                88: [2995, 4, "Ustootia"],
                89: [2997, 2, "Drayos"],
                90: [2999, 3, "Yoidios"],
                92: [3734, 3, "Reldaios"],
                93: [3732, 1, "Aweatia"],
                99: [4423, 1, "Llauvaos"],
                100: [4424, 2, "Deneetia"]
            },
            38: {
                1: [4744, 3, "Zaceios"],
                2: [4742, 1, "Chrufios"],
                7: [3490, 1, "Rusuos"],
                8: [3489, 4, "Viaxios"],
                13: [2744, 3, "Smeahios"],
                14: [2742, 2, "Nucios"],
                16: [2747, 1, "Snasuos"],
                17: [2748, 2, "Beyios"],
                18: [2749, 3, "Lyeaetia"],
                20: [2152, 2, "Chrooxios"],
                21: [2153, 3, "Nenios"],
                23: [1695, 3, "Queauos"],
                24: [1693, 1, "Rynoitia"],
                25: [1691, 3, "Woraos"],
                26: [1689, 1, "Leutios"],
                31: [884, 3, "Deleitia"],
                32: [883, 2, "Moseos"],
                34: [603, 1, "Hinootia"],
                35: [600, 2, "Shyiaos"],
                36: [598, 4, "Hatieos"],
                37: [593, 3, "Ducaios"],
                38: [592, 2, "Vymios"],
                40: [358, 2, "Zhaisios"],
                41: [357, 3, "Adoeos"],
                42: [360, 4, "Urnoitia"],
                44: [368, 1, "Dribios"],
                45: [369, 2, "Rileos"],
                47: [177, 4, "Dihios"],
                48: [178, 2, "Chaios"],
                49: [181, 4, "Striwios"],
                50: [182, 3, "Typios"],
                51: [183, 1, "Slertoos"],
                52: [185, 3, "Inaytia"],
                54: [188, 4, "Cherios"],
                55: [189, 1, "Reduos"],
                56: [203, 3, "Noibios"],
                57: [206, 4, "Dofios"],
                59: [417, 3, "Diwios"],
                60: [419, 4, "Smeyckoios"],
                62: [640, 4, "Hinatia"],
                63: [642, 2, "Aldiaos"],
                64: [643, 3, "Smounios"],
                65: [649, 2, "Asatia"],
                67: [973, 4, "Toryos"],
                68: [976, 2, "Tasoetia"],
                70: [1407, 1, "Awitia"],
                71: [1409, 3, "Caldaios"],
                73: [1404, 4, "Zudios"],
                74: [1406, 3, "Sleiguos"],
                76: [1418, 3, "Aseutia"],
                77: [1420, 1, "Hatootia"],
                83: [2349, 3, "Kaiyios"],
                84: [2351, 2, "Isitia"],
                95: [3745, 3, "Crisios"],
                96: [3746, 2, "Trouthaios"],
                98: [4421, 3, "Sulietia"],
                99: [4422, 4, "Aldetia"]
            },
            39: {
                1: [4743, 2, "Omitia"],
                2: [4741, 4, "Bleufios"],
                4: [4118, 1, "Hucios"],
                5: [4119, 4, "Sereaos"],
                10: [3482, 3, "Ruwios"],
                11: [3481, 1, "Nazoos"],
                13: [2743, 1, "Imotia"],
                14: [2741, 4, "Yiesaios"],
                16: [2745, 3, "Tanaytia"],
                17: [2746, 4, "Teciios"],
                28: [1208, 2, "Teinios"],
                29: [1207, 1, "Estios"],
                31: [882, 1, "Quaoeos"],
                32: [881, 4, "Zhydios"],
                34: [602, 4, "Goonoos"],
                35: [601, 3, "Koseos"],
                37: [591, 1, "Wybios"],
                38: [590, 4, "Oughatia"],
                40: [355, 4, "Oughauos"],
                41: [356, 1, "Taroos"],
                42: [359, 2, "Miluos"],
                47: [175, 1, "Phuifeios"],
                48: [176, 3, "Detios"],
                49: [179, 1, "Naleuos"],
                50: [180, 2, "Shertios"],
                51: [184, 4, "Brilios"],
                52: [186, 2, "Slameios"],
                54: [187, 3, "Ziwios"],
                55: [190, 2, "Tinaeos"],
                60: [420, 2, "Ildutia"],
                67: [974, 1, "Ormutia"],
                68: [975, 3, "Skeloitia"],
                70: [1408, 2, "Streardeos"],
                71: [1410, 4, "Joneos"],
                76: [1419, 4, "Nalotia"],
                77: [1421, 2, "Snurios"],
                79: [1853, 1, "Endeos"],
                80: [1855, 2, "Hyckiios"],
                81: [1857, 1, "Yysios"],
                83: [2350, 1, "Belytia"],
                84: [2352, 4, "Zokios"],
                85: [2356, 2, "Kymuios"],
                87: [3000, 2, "Itetia"],
                88: [3002, 1, "Chraybios"],
                89: [3006, 4, "Whasyios"],
                91: [3736, 1, "Beletia"],
                92: [3738, 3, "Mapios"],
                93: [3740, 1, "Naevyos"],
                94: [3742, 3, "Tufios"],
                95: [3744, 1, "Troreios"],
                96: [3747, 4, "Rixios"],
                98: [4419, 1, "Shiwuos"],
                99: [4420, 2, "Naunios"]
            },
            40: {
                1: [4740, 3, "Risoeos"],
                2: [4738, 1, "Delooos"],
                4: [4116, 3, "Quaeos"],
                5: [4117, 2, "Ziaxios"],
                7: [3488, 2, "Unteos"],
                8: [3486, 4, "Foeraios"],
                9: [3484, 2, "Luidios"],
                10: [3480, 4, "Turutia"],
                11: [3478, 2, "Neequios"],
                13: [2740, 3, "Kalios"],
                14: [2739, 2, "Japios"],
                19: [2150, 4, "Tanoos"],
                20: [2149, 3, "Jixaos"],
                21: [2148, 2, "Smofeios"],
                23: [1688, 2, "Daejios"],
                24: [1687, 4, "Skeleatia"],
                25: [1686, 2, "Rynatia"],
                27: [1209, 4, "Inauos"],
                28: [1205, 3, "Dickiios"],
                29: [1206, 4, "Bubuios"],
                44: [172, 3, "Kalaios"],
                45: [171, 2, "Blutios"],
                57: [213, 1, "Nyruios"],
                58: [212, 2, "Umitia"],
                60: [421, 1, "Leaxios"],
                61: [422, 3, "Nimaios"],
                62: [423, 2, "Iaitia"],
                64: [657, 4, "Havios"],
                65: [659, 2, "Cheytia"],
                71: [1411, 1, "Erautia"],
                72: [1412, 2, "Tanios"],
                73: [1414, 3, "Cefios"],
                74: [1416, 1, "Geyrios"],
                76: [1422, 3, "Phihios"],
                77: [1424, 1, "Fandyios"],
                79: [1854, 3, "Rharios"],
                80: [1856, 4, "Vesetia"],
                81: [1858, 3, "Serios"],
                83: [2353, 3, "Aldeos"],
                84: [2354, 2, "Strepios"],
                85: [2355, 1, "Rayatia"],
                87: [3001, 4, "Struqiios"],
                88: [3003, 3, "Yaytios"],
                89: [3007, 2, "Gekoos"],
                91: [3737, 2, "Sametia"],
                92: [3739, 4, "Vevios"],
                93: [3741, 2, "Nalayos"],
                94: [3743, 4, "Rilauos"]
            },
            41: {
                1: [4739, 2, "Smaykaios"],
                2: [4736, 4, "Gowios"],
                4: [4115, 1, "Namios"],
                5: [4114, 4, "Entheos"],
                7: [3487, 1, "Tureaos"],
                8: [3485, 3, "Oseatia"],
                9: [3483, 1, "Geevios"],
                10: [3479, 3, "Cilios"],
                11: [3477, 1, "Essoios"],
                13: [2737, 4, "Zheinios"],
                14: [2738, 1, "Awaos"],
                16: [2723, 2, "Kalietia"],
                17: [2722, 1, "Thadeios"],
                19: [2151, 2, "Banaetia"],
                20: [2147, 1, "Ightatia"],
                21: [2146, 4, "Womios"],
                23: [1683, 3, "Areytia"],
                24: [1684, 1, "Radutia"],
                25: [1685, 3, "Usteos"],
                27: [1204, 2, "Taiutia"],
                28: [1203, 1, "Tureyos"],
                31: [880, 3, "Kaletia"],
                32: [879, 1, "Sayyos"],
                34: [588, 2, "Omaios"],
                35: [587, 3, "Deltoios"],
                36: [584, 2, "Dynoios"],
                37: [585, 3, "Ludios"],
                39: [353, 1, "Asuios"],
                40: [352, 3, "Sneivios"],
                42: [174, 2, "Whoocios"],
                43: [168, 1, "Daetios"],
                44: [169, 4, "Blafios"],
                45: [170, 1, "Nimoios"],
                47: [80, 3, "Cereitia"],
                48: [79, 2, "Essuos"],
                50: [82, 3, "Untuios"],
                51: [84, 1, "Shasoos"],
                53: [91, 3, "Fiesoios"],
                54: [90, 1, "Zisios"],
                56: [207, 4, "Rinios"],
                57: [210, 3, "Roeghoios"],
                58: [211, 4, "Tyqiios"],
                61: [425, 4, "Rhotios"],
                62: [424, 1, "Onauos"],
                64: [658, 1, "Isaios"],
                65: [660, 3, "Novuos"],
                66: [661, 4, "Voreos"],
                68: [977, 2, "Braltuos"],
                69: [979, 1, "Ryfuios"],
                72: [1413, 1, "Dynouos"],
                73: [1415, 4, "Tanayos"],
                74: [1417, 2, "Yyhaios"],
                76: [1423, 4, "Rulios"],
                77: [1425, 2, "Engutia"],
                80: [1859, 2, "Thosiios"],
                81: [1860, 1, "Uskutia"],
                87: [3004, 2, "Moudios"],
                88: [3005, 1, "Ardaeos"],
                93: [3748, 3, "Throhios"],
                94: [3749, 1, "Pereos"],
                96: [4409, 1, "Swariios"],
                97: [4411, 3, "Stoullaios"],
                98: [4413, 1, "Undayos"],
                99: [4415, 3, "Nysuos"]
            },
            42: {
                4: [4113, 2, "Strarios"],
                5: [4111, 3, "Kekios"],
                16: [2724, 3, "Undieos"],
                17: [2721, 4, "Foegios"],
                20: [2145, 3, "Leerios"],
                21: [2144, 2, "Schainduos"],
                23: [1682, 4, "Chroelaos"],
                24: [1681, 2, "Huigios"],
                27: [1201, 3, "Damios"],
                28: [1202, 4, "Galios"],
                30: [876, 1, "Aleaios"],
                31: [877, 4, "Oldeetia"],
                32: [878, 2, "Hataios"],
                34: [589, 1, "Gesios"],
                35: [586, 4, "Adyos"],
                36: [583, 1, "Kenaos"],
                37: [582, 4, "Rilautia"],
                39: [354, 4, "Lluboos"],
                40: [351, 2, "Vaitaos"],
                42: [173, 4, "Vohios"],
                43: [167, 3, "Sealoios"],
                44: [166, 2, "Stroelios"],
                47: [77, 4, "Ghauios"],
                48: [78, 1, "Schoirios"],
                50: [81, 2, "Rotheaos"],
                51: [83, 4, "Kimoos"],
                52: [86, 2, "Schupios"],
                53: [88, 4, "Sulouos"],
                54: [89, 2, "Elmetia"],
                56: [208, 1, "Thofios"],
                57: [209, 2, "Llaydios"],
                58: [214, 1, "Swytios"],
                59: [217, 2, "Bejios"],
                65: [664, 2, "Deleutia"],
                66: [663, 1, "Chavios"],
                68: [978, 4, "Oldeuos"],
                69: [980, 3, "Ghaoos"],
                70: [987, 2, "Doltiios"],
                76: [1426, 3, "Sailaos"],
                77: [1428, 1, "Chaauos"],
                78: [1430, 3, "Hatuios"],
                80: [1861, 4, "Erytia"],
                81: [1862, 3, "Dynitia"],
                82: [1865, 4, "Rhysios"],
                84: [2358, 4, "Cloeheos"],
                85: [2359, 1, "Adatia"],
                90: [3035, 4, "Triruos"],
                91: [3036, 1, "Troesios"],
                96: [4410, 2, "Jouraos"],
                97: [4412, 4, "Jemaios"],
                98: [4414, 2, "Lonios"],
                99: [4416, 4, "Eldoios"]
            },
            43: {
                3: [4122, 1, "Sneeroios"],
                4: [4112, 4, "Faehios"],
                5: [4110, 1, "Vereyos"],
                7: [3476, 2, "Crisaios"],
                8: [3468, 1, "Smodios"],
                9: [3466, 4, "Adaos"],
                11: [2734, 2, "Keavios"],
                12: [2731, 1, "Slusios"],
                13: [2730, 2, "Poeyyios"],
                14: [2729, 1, "Girios"],
                17: [2720, 3, "Rhugios"],
                18: [2719, 2, "Fialios"],
                20: [2143, 1, "Snisios"],
                21: [2142, 4, "Honytia"],
                26: [1200, 2, "Cibuios"],
                27: [1199, 1, "Esteyos"],
                30: [875, 2, "Coghoos"],
                31: [874, 3, "Achytia"],
                36: [580, 2, "Endotia"],
                37: [581, 3, "Beehoios"],
                39: [350, 3, "Teyfios"],
                40: [349, 1, "Molios"],
                46: [76, 1, "Slumios"],
                47: [75, 2, "Tareios"],
                52: [85, 1, "Oldios"],
                53: [87, 3, "Creyios"],
                58: [215, 3, "Clydios"],
                59: [216, 4, "Angeytia"],
                60: [220, 1, "Sootios"],
                62: [426, 2, "Syrtaios"],
                63: [428, 4, "Lietios"],
                65: [665, 3, "Branios"],
                66: [666, 4, "Ticios"],
                68: [981, 2, "Hiasiios"],
                69: [982, 1, "Threrrios"],
                70: [983, 4, "Eniatia"],
                71: [985, 3, "Etitia"],
                73: [991, 3, "Remios"],
                74: [993, 1, "Ateatia"],
                76: [1427, 4, "Denytia"],
                77: [1429, 2, "Isseuos"],
                78: [1431, 4, "Vabaios"],
                80: [1863, 2, "Aldoitia"],
                81: [1864, 1, "Sluviios"],
                82: [1866, 2, "Sebios"],
                84: [2360, 2, "Tiaayos"],
                85: [2361, 3, "Phiyaios"],
                87: [3008, 4, "Ceritia"],
                88: [3010, 3, "Nubuos"],
                89: [3012, 4, "Iroitia"],
                90: [3034, 3, "Pereutia"],
                91: [3037, 2, "Irotia"],
                93: [3750, 1, "Worytia"],
                94: [3752, 3, "Ruilios"],
                97: [4417, 1, "Sacyios"],
                98: [4418, 3, "Swisios"]
            },
            44: {
                3: [4121, 2, "Untios"],
                4: [4120, 3, "Nayvios"],
                7: [3471, 4, "Nuyiios"],
                8: [3467, 3, "Roonios"],
                9: [3465, 2, "Angoos"],
                11: [2733, 3, "Enitia"],
                12: [2732, 4, "Tydios"],
                13: [2728, 3, "Slaunuios"],
                14: [2726, 4, "Hidios"],
                16: [2716, 3, "Cheutia"],
                17: [2717, 4, "Rodaeos"],
                18: [2718, 1, "Honoos"],
                20: [2141, 3, "Kusyios"],
                21: [2140, 2, "Rydyios"],
                23: [1679, 4, "Ardaos"],
                24: [1680, 1, "Cerauos"],
                26: [1197, 3, "Llorreos"],
                27: [1198, 4, "Taepios"],
                29: [871, 1, "Ranaytia"],
                30: [872, 4, "Lyeaytia"],
                31: [873, 1, "Rayetia"],
                33: [578, 2, "Eldeos"],
                34: [579, 3, "Tiaaos"],
                39: [347, 2, "Hicaios"],
                40: [348, 4, "Ranuitia"],
                42: [164, 2, "Voigios"],
                43: [163, 1, "Chadoios"],
                45: [72, 3, "Zhexios"],
                46: [73, 4, "Depuios"],
                47: [74, 3, "Shaymios"],
                49: [29, 3, "Ireaos"],
                50: [27, 1, "Peelios"],
                55: [92, 4, "Zenniios"],
                56: [95, 3, "Taiiatia"],
                59: [218, 2, "Cheoeos"],
                60: [219, 3, "Wildoios"],
                62: [427, 1, "Faelaios"],
                63: [429, 3, "Smofios"],
                69: [990, 3, "Woroitia"],
                70: [984, 2, "Ceameios"],
                71: [986, 1, "Zaukios"],
                73: [992, 4, "Cryriios"],
                74: [994, 2, "Worios"],
                84: [2362, 4, "Toruos"],
                85: [2363, 1, "Nyyos"],
                87: [3009, 2, "Taieeos"],
                88: [3011, 1, "Looqeios"],
                89: [3013, 2, "Hycoos"],
                90: [3038, 1, "Rodoetia"],
                93: [3751, 2, "Roditia"],
                94: [3753, 4, "Belatia"],
                95: [3758, 1, "Tiaitia"]
            },
            45: {
                6: [3475, 2, "Tedios"],
                7: [3470, 1, "Toneaos"],
                8: [3469, 2, "Paymaios"],
                13: [2727, 1, "Queytia"],
                14: [2725, 2, "Tiauios"],
                16: [2714, 1, "Quymoos"],
                17: [2715, 2, "Sulatia"],
                23: [1678, 2, "Moemios"],
                24: [1677, 3, "Jocios"],
                29: [870, 3, "Ustautia"],
                30: [869, 2, "Atytia"],
                33: [577, 4, "Dianios"],
                34: [576, 1, "Moraos"],
                36: [346, 3, "Nenaios"],
                37: [344, 1, "Cuhyios"],
                42: [162, 4, "Janios"],
                43: [161, 3, "Smibios"],
                45: [71, 2, "Phiyios"],
                46: [70, 1, "Lootios"],
                49: [28, 2, "Kiyaios"],
                50: [26, 4, "Veseaos"],
                52: [34, 2, "Thromios"],
                53: [35, 1, "Rixyos"],
                55: [93, 2, "Onaos"],
                56: [94, 1, "Thuluios"],
                57: [96, 2, "Darotia"],
                63: [430, 2, "Mibeos"],
                64: [431, 1, "Pesios"],
                66: [667, 2, "Rilitia"],
                67: [668, 1, "Caunoos"],
                73: [995, 3, "Liacios"],
                74: [997, 1, "Zuidios"],
                76: [1432, 3, "Cuidios"],
                77: [1434, 1, "Tiaeos"],
                79: [1867, 4, "Darytia"],
                80: [1869, 2, "Aleooos"],
                81: [1871, 1, "Thraimoios"],
                82: [1875, 3, "Strimeos"],
                84: [2364, 2, "Hinios"],
                85: [2365, 3, "Emytia"],
                90: [3039, 4, "Nuvios"],
                91: [3043, 3, "Enditia"],
                93: [3754, 1, "Ashauos"],
                94: [3756, 3, "Rakatia"],
                95: [3759, 2, "Uskuos"],
                97: [3768, 3, "Naloios"],
                98: [3769, 1, "Engeeos"]
            },
            46: {
                3: [4730, 1, "Thyceos"],
                4: [4731, 2, "Rythaos"],
                6: [3474, 1, "Ritaos"],
                7: [3473, 3, "Zhecios"],
                10: [3462, 1, "Araios"],
                11: [3461, 3, "Wesiios"],
                19: [2139, 4, "Sohuios"],
                20: [2138, 2, "Burotia"],
                22: [1674, 2, "Loritia"],
                23: [1673, 1, "Sleceios"],
                24: [1676, 4, "Yonoos"],
                26: [1191, 1, "Dibaios"],
                27: [1192, 3, "Nysoitia"],
                32: [573, 1, "Hofios"],
                33: [574, 2, "Hyhyos"],
                34: [575, 3, "Pycios"],
                36: [345, 2, "Ildeitia"],
                37: [343, 4, "Heymios"],
                38: [342, 3, "Maycios"],
                39: [340, 1, "Zheynios"],
                41: [165, 3, "Banotia"],
                42: [159, 2, "Kapios"],
                43: [160, 1, "Threcios"],
                48: [25, 1, "Phiaxios"],
                49: [19, 4, "Doilios"],
                50: [20, 1, "Alduos"],
                52: [30, 3, "Rynetia"],
                53: [33, 4, "Ataitia"],
                57: [97, 4, "Jeuxaios"],
                58: [98, 1, "Zhixios"],
                60: [221, 4, "Enthuios"],
                61: [224, 3, "Kimetia"],
                63: [432, 4, "Checios"],
                64: [433, 3, "Lethoios"],
                66: [669, 4, "Quaeatia"],
                67: [670, 3, "Coohoios"],
                68: [674, 2, "Oughotia"],
                70: [687, 4, "Sleileios"],
                71: [688, 1, "Dyrios"],
                73: [996, 4, "Bockoios"],
                74: [998, 2, "Skelayos"],
                76: [1433, 4, "Raenios"],
                77: [1435, 2, "Slairios"],
                79: [1868, 1, "Echios"],
                80: [1870, 3, "Quaatia"],
                81: [1872, 4, "Hatatia"],
                82: [1876, 2, "Sayitia"],
                87: [3044, 1, "Leteios"],
                88: [3045, 3, "Trisios"],
                90: [3041, 1, "Iretia"],
                91: [3042, 2, "Engaios"],
                93: [3755, 2, "Snolteios"],
                94: [3757, 4, "Oldeos"],
                97: [3766, 4, "Zhughoios"],
                98: [3767, 2, "Radeyos"]
            },
            47: {
                3: [4728, 4, "Medios"],
                4: [4727, 3, "Leiphyios"],
                9: [3463, 4, "Osatia"],
                10: [3460, 2, "Yerytia"],
                11: [3459, 4, "Nopios"],
                13: [2712, 4, "Seroios"],
                14: [2713, 2, "Sayuios"],
                16: [2132, 4, "Crysios"],
                17: [2131, 3, "Loubios"],
                18: [2136, 4, "Nozaios"],
                19: [2135, 3, "Supoos"],
                20: [2137, 1, "Phupyios"],
                22: [1671, 3, "Snadios"],
                23: [1672, 4, "Keleutia"],
                24: [1675, 3, "Shyeatia"],
                26: [1189, 2, "Whanios"],
                27: [1190, 4, "Draeaos"],
                29: [868, 2, "Shazios"],
                30: [867, 3, "Tanyios"],
                32: [572, 4, "Risuos"],
                33: [571, 3, "Ranetia"],
                38: [341, 2, "Ghaytia"],
                39: [339, 4, "Luraos"],
                41: [158, 4, "Hayghoos"],
                42: [157, 3, "Rilotia"],
                45: [67, 3, "Nyyyos"],
                46: [66, 2, "Samuos"],
                48: [24, 2, "Ponyos"],
                49: [18, 3, "Tissoios"],
                50: [17, 2, "Unteyos"],
                52: [31, 1, "Koedaos"],
                53: [32, 2, "Joukios"],
                54: [36, 3, "Streybios"],
                55: [37, 2, "Thrajios"],
                57: [99, 3, "Echiaos"],
                58: [100, 2, "Yatios"],
                60: [222, 1, "Cezaos"],
                61: [223, 2, "Hehios"],
                63: [434, 2, "Sihyos"],
                64: [435, 1, "Omiatia"],
                66: [671, 2, "Chayos"],
                67: [672, 1, "Whefoios"],
                68: [673, 4, "Turaitia"],
                70: [686, 3, "Cywaios"],
                71: [685, 2, "Baiciios"],
                76: [1436, 3, "Heynaios"],
                77: [1438, 1, "Kibios"],
                80: [1873, 2, "Neliios"],
                81: [1874, 1, "Bloutios"],
                84: [2370, 1, "Ackaitia"],
                85: [2371, 2, "Kakios"],
                87: [3046, 2, "Swoulios"],
                88: [3047, 4, "Ingeuos"],
                96: [3760, 3, "Chriarios"],
                97: [3762, 1, "Chruidios"],
                98: [3764, 3, "Sluimios"]
            },
            48: {
                3: [4729, 1, "Chocios"],
                4: [4726, 2, "Dimios"],
                6: [4109, 4, "Umyos"],
                7: [4107, 2, "Brivios"],
                9: [3464, 1, "Slijios"],
                10: [3458, 3, "Smounaos"],
                11: [3457, 1, "Lluisaos"],
                13: [2711, 1, "Emeytia"],
                14: [2710, 3, "Reyloos"],
                16: [2129, 1, "Serietia"],
                17: [2130, 2, "Olduos"],
                18: [2133, 1, "Thoesios"],
                19: [2134, 2, "Lothyios"],
                26: [1188, 3, "Tekyos"],
                27: [1186, 1, "Brylaos"],
                29: [865, 1, "Draheios"],
                30: [864, 4, "Toutaios"],
                35: [568, 2, "Chaotia"],
                36: [567, 1, "Ingitia"],
                38: [338, 3, "Urnutia"],
                39: [336, 1, "Elmitia"],
                41: [156, 2, "Oroos"],
                42: [155, 1, "Haunios"],
                44: [69, 2, "Sleyvios"],
                45: [65, 4, "Worooos"],
                46: [64, 1, "Whelios"],
                54: [39, 1, "Risautia"],
                55: [38, 4, "Lleatios"],
                60: [225, 4, "Nysios"],
                61: [226, 1, "Litios"],
                70: [683, 4, "Hatitia"],
                71: [684, 1, "Emoios"],
                73: [999, 4, "Ireios"],
                74: [1001, 2, "Echytia"],
                76: [1437, 4, "Warauos"],
                77: [1439, 2, "Isaos"],
                78: [1440, 3, "Tijios"],
                83: [2366, 1, "Samauos"],
                84: [2368, 3, "Gaicios"],
                85: [2372, 4, "Athoos"],
                87: [3048, 1, "Boecaios"],
                88: [3049, 3, "Rodaos"],
                89: [3055, 2, "Touluios"],
                91: [3056, 4, "Claulios"],
                92: [3058, 2, "Ingotia"],
                93: [3060, 4, "Troisaos"],
                94: [3062, 2, "Blereos"],
                96: [3761, 4, "Snoolios"],
                97: [3763, 2, "Voroitia"],
                98: [3765, 4, "Stratios"]
            },
            49: {
                2: [4732, 4, "Biamuios"],
                3: [4723, 3, "Liceos"],
                4: [4724, 4, "Achuos"],
                6: [4108, 1, "Dowios"],
                7: [4106, 3, "Enoitia"],
                10: [3456, 2, "Llisyios"],
                11: [3455, 4, "Killoos"],
                13: [2709, 2, "Arieos"],
                14: [2707, 4, "Vafoios"],
                21: [1666, 1, "Lintiios"],
                22: [1664, 3, "Ruikios"],
                24: [1196, 3, "Neemios"],
                25: [1194, 1, "Veydios"],
                26: [1187, 2, "Sulyos"],
                27: [1185, 4, "Lyeetia"],
                29: [866, 3, "Saetaios"],
                30: [862, 2, "Rhietios"],
                31: [860, 4, "Cebios"],
                32: [858, 2, "Sheynoos"],
                34: [570, 1, "Kehios"],
                35: [566, 4, "Saucios"],
                36: [565, 3, "Quaooos"],
                38: [337, 2, "Atios"],
                39: [335, 4, "Nepaios"],
                44: [68, 1, "Wikios"],
                45: [63, 3, "Cheeios"],
                46: [61, 2, "Eldeitia"],
                48: [7, 3, "Vievios"],
                49: [16, 1, "Mosoos"],
                51: [11, 1, "Llerios"],
                52: [13, 2, "Riloos"],
                57: [101, 2, "Stetios"],
                58: [102, 1, "Voreetia"],
                60: [227, 2, "Blusaos"],
                61: [228, 3, "Meuzios"],
                62: [229, 4, "Loolios"],
                64: [436, 2, "Therauos"],
                65: [438, 4, "Snautios"],
                67: [675, 4, "Sebiios"],
                68: [678, 3, "Yayios"],
                69: [680, 1, "Eruios"],
                70: [681, 2, "Blynios"],
                73: [1000, 3, "Schytios"],
                74: [1002, 1, "Shiariios"],
                77: [1442, 1, "Rayeeos"],
                78: [1441, 4, "Clykeios"],
                80: [1877, 1, "Dootoos"],
                81: [1879, 3, "Kelaetia"],
                83: [2367, 2, "Leathoios"],
                84: [2369, 4, "Zaynoos"],
                87: [3050, 2, "Oritia"],
                88: [3051, 4, "Wixoos"],
                89: [3054, 1, "Hoveos"],
                91: [3057, 1, "Chusaios"],
                92: [3059, 3, "Dysseios"],
                93: [3061, 1, "Davaios"],
                94: [3063, 3, "Voreyos"]
            },
            50: {
                2: [4733, 2, "Toexios"],
                3: [4719, 1, "Somoos"],
                4: [4725, 2, "Blouleos"],
                6: [4099, 4, "Neenios"],
                7: [4101, 2, "Ceidyios"],
                9: [3453, 2, "Aughatia"],
                10: [3451, 1, "Gepios"],
                11: [3454, 3, "Staugios"],
                13: [2708, 1, "Riloeos"],
                14: [2706, 3, "Liwaos"],
                16: [2126, 3, "Whoisios"],
                17: [2127, 2, "Ceraos"],
                19: [1670, 1, "Thacuios"],
                20: [1668, 3, "Sayoetia"],
                21: [1665, 4, "Keaneios"],
                22: [1663, 2, "Huldiios"],
                24: [1195, 2, "Cheadios"],
                25: [1193, 4, "Lanuos"],
                30: [863, 1, "Saluios"],
                31: [861, 3, "Nezyos"],
                32: [859, 1, "Duiweos"],
                34: [569, 3, "Unteatia"],
                35: [563, 2, "Slestoos"],
                36: [564, 1, "Risietia"],
                41: [153, 2, "Mosautia"],
                42: [152, 3, "Wubios"],
                45: [62, 4, "Shydeos"],
                46: [60, 1, "Nuireos"],
                48: [6, 2, "Awios"],
                49: [4, 4, "Moroeos"],
                50: [1, 2, "Mirruos"],
                51: [9, 4, "Zuneos"],
                52: [15, 3, "Kalaos"],
                54: [40, 4, "Brasaos"],
                55: [43, 3, "Llusiios"],
                57: [103, 4, "Cudios"],
                58: [104, 3, "Wemios"],
                61: [231, 2, "Engytia"],
                62: [230, 1, "Kisoios"],
                64: [437, 3, "Saebiios"],
                65: [439, 1, "Ranuos"],
                67: [676, 1, "Baitios"],
                68: [677, 2, "Trozios"],
                69: [679, 4, "Cauntios"],
                70: [682, 3, "Rakeutia"],
                72: [1003, 4, "Gewios"],
                73: [1004, 3, "Ormytia"],
                74: [1007, 2, "Risiatia"],
                75: [1008, 4, "Chonnaos"],
                80: [1878, 2, "Dezios"],
                81: [1880, 4, "Shyeeos"],
                84: [2373, 1, "Elditia"],
                85: [2376, 3, "Veseitia"],
                87: [3052, 1, "Celios"],
                88: [3053, 3, "Hadoos"],
                96: [3770, 1, "Madios"],
                97: [3772, 2, "Riacios"],
                98: [3774, 1, "Blaysaios"],
                99: [3776, 2, "Troukios"]
            },
            51: {
                6: [4098, 3, "Imutia"],
                7: [4100, 1, "Emeos"],
                9: [3452, 4, "Dynatia"],
                10: [3450, 3, "Gerios"],
                16: [2125, 4, "Jicios"],
                17: [2128, 1, "Foenios"],
                19: [1669, 4, "Ciemoos"],
                20: [1667, 2, "Stravios"],
                27: [1175, 1, "Eldutia"],
                28: [1173, 3, "Phiacios"],
                35: [561, 3, "Phimios"],
                36: [562, 4, "Lerutia"],
                38: [332, 3, "Slelios"],
                39: [333, 4, "Strimios"],
                41: [154, 1, "Zenios"],
                42: [151, 4, "Lezaios"],
                43: [150, 2, "Likoios"],
                49: [5, 1, "Browios"],
                50: [2, 3, "Tineos"],
                54: [41, 2, "Stonaos"],
                55: [42, 1, "Lyeoetia"],
                57: [105, 2, "Slybios"],
                58: [106, 1, "Laereios"],
                59: [109, 4, "Gihios"],
                64: [440, 2, "Seunios"],
                65: [441, 3, "Radatia"],
                72: [1006, 1, "Vocios"],
                73: [1005, 2, "Dileios"],
                74: [1009, 1, "Aleayos"],
                75: [1010, 3, "Daeshyios"],
                77: [1443, 4, "Riyios"],
                78: [1445, 2, "Kinouos"],
                81: [1881, 1, "Tinaetia"],
                82: [1882, 2, "Nyaos"],
                84: [2374, 4, "Asheaos"],
                85: [2375, 2, "Shessoos"],
                90: [2383, 2, "Rodios"],
                91: [2385, 4, "Swubyos"],
                93: [3064, 1, "Chaitia"],
                94: [3066, 3, "Lyeitia"],
                96: [3771, 4, "Strehyos"],
                97: [3773, 3, "Aleoutia"],
                98: [3775, 4, "Thrasuos"],
                99: [3777, 3, "Bronyios"],
                100: [3778, 1, "Enaos"]
            },
            52: {
                2: [4710, 4, "Wenios"],
                3: [4709, 3, "Soisios"],
                5: [4097, 2, "Quolios"],
                6: [4095, 4, "Achayos"],
                12: [2705, 1, "Dareetia"],
                13: [2695, 3, "Nysuios"],
                14: [2694, 1, "Trytyos"],
                16: [2124, 2, "Araos"],
                17: [2121, 3, "Dartaios"],
                22: [1654, 2, "Lidyios"],
                23: [1652, 4, "Loryos"],
                25: [1183, 1, "Woratia"],
                26: [1181, 3, "Bleuzios"],
                27: [1176, 2, "Poluitia"],
                28: [1174, 4, "Toraitia"],
                30: [857, 2, "Itauos"],
                31: [855, 4, "Ageetia"],
                32: [853, 2, "Rayckeos"],
                33: [851, 4, "Wysyios"],
                35: [560, 2, "Toreos"],
                36: [559, 1, "Inaeios"],
                38: [331, 2, "Nacios"],
                39: [330, 1, "Liwios"],
                43: [145, 1, "Nysetia"],
                44: [144, 3, "Rouyios"],
                46: [58, 1, "Phytios"],
                47: [57, 4, "Toreaos"],
                52: [48, 2, "Ositia"],
                53: [45, 1, "Niraios"],
                54: [44, 4, "Lareios"],
                57: [107, 4, "Denaos"],
                58: [108, 3, "Quaoos"],
                59: [110, 2, "Danaios"],
                61: [232, 3, "Snorios"],
                62: [233, 4, "Tralios"],
                64: [442, 4, "Rogios"],
                65: [443, 1, "Shagiios"],
                67: [691, 4, "Syciios"],
                68: [693, 3, "Turios"],
                69: [695, 1, "Endyos"],
                70: [697, 2, "Swicyios"],
                77: [1444, 1, "Ryzeos"],
                78: [1446, 3, "Llakios"],
                79: [1451, 4, "Neavoos"],
                81: [1883, 3, "Eteetia"],
                82: [1884, 4, "Smaerios"],
                87: [2377, 4, "Thameos"],
                88: [2379, 2, "Thorios"],
                89: [2381, 4, "Rynooos"],
                90: [2384, 3, "Maifoos"],
                91: [2386, 1, "Kahios"],
                93: [3065, 2, "Roenios"],
                94: [3067, 4, "Rodetia"],
                99: [3780, 2, "Renyios"],
                100: [3779, 4, "Kourios"]
            },
            53: {
                1: [4717, 1, "Nyoos"],
                2: [4712, 2, "Turatia"],
                3: [4711, 1, "Kinuitia"],
                5: [4096, 1, "Emaos"],
                6: [4094, 3, "Quautia"],
                8: [3445, 1, "Kainuios"],
                9: [3443, 3, "Cycuos"],
                10: [3441, 1, "Tryseos"],
                12: [2699, 3, "Mooweos"],
                13: [2696, 4, "Deluos"],
                14: [2693, 2, "Seshaos"],
                16: [2123, 1, "Nozios"],
                17: [2122, 4, "Cleadoos"],
                18: [2119, 1, "Soutios"],
                19: [2117, 3, "Puneos"],
                21: [1656, 4, "Tykios"],
                22: [1655, 3, "Hinaetia"],
                23: [1653, 1, "Awietia"],
                25: [1184, 2, "Samaos"],
                26: [1182, 4, "Denios"],
                27: [1179, 1, "Imaeos"],
                28: [1177, 3, "Slakios"],
                30: [856, 1, "Nimeos"],
                31: [854, 3, "Tiaootia"],
                32: [852, 1, "Drerios"],
                33: [850, 3, "Yanaos"],
                38: [334, 1, "Cliwios"],
                39: [329, 4, "Ormiatia"],
                40: [327, 2, "Zaroios"],
                42: [149, 2, "Striwoios"],
                43: [146, 4, "Ineitia"],
                44: [143, 2, "Umeos"],
                46: [59, 2, "Dydios"],
                47: [56, 3, "Raneytia"],
                48: [54, 1, "Loratia"],
                49: [52, 3, "Drearios"],
                50: [50, 2, "Torytia"],
                52: [49, 4, "Anauos"],
                53: [46, 3, "Ormieos"],
                54: [47, 2, "Thusiios"],
                56: [111, 2, "Engatia"],
                57: [112, 1, "Brewios"],
                61: [234, 1, "Ashytia"],
                62: [235, 2, "Rethiios"],
                64: [445, 3, "Miraios"],
                65: [444, 2, "Iritia"],
                67: [692, 1, "Stridios"],
                68: [694, 2, "Rarios"],
                69: [696, 4, "Nydios"],
                70: [698, 3, "Osios"],
                71: [701, 4, "Rynios"],
                73: [1011, 3, "Ingutia"],
                74: [1013, 1, "Lyeutia"],
                75: [1021, 4, "Lodyos"],
                77: [1447, 4, "Boidiios"],
                78: [1449, 2, "Tureos"],
                79: [1452, 1, "Wokios"],
                81: [1885, 1, "Llyrios"],
                82: [1886, 2, "Zhydeos"],
                84: [1887, 3, "Swounios"],
                85: [1889, 1, "Jocoos"],
                87: [2378, 1, "Nysoos"],
                88: [2380, 3, "Nilios"],
                89: [2382, 1, "Enduos"],
                93: [3068, 1, "Kisuios"],
                94: [3070, 3, "Baegoos"],
                96: [3783, 2, "Enetia"],
                97: [3785, 1, "Rakutia"]
            },
            54: {
                1: [4714, 4, "Lerauos"],
                2: [4713, 3, "Ineuos"],
                8: [3444, 4, "Noboios"],
                9: [3442, 2, "Llyllyos"],
                10: [3440, 4, "Swodyos"],
                12: [2698, 2, "Fekios"],
                13: [2697, 1, "Huvios"],
                18: [2120, 2, "Naeloios"],
                19: [2118, 4, "Keniios"],
                21: [1657, 1, "Rayautia"],
                22: [1658, 2, "Mysoos"],
                27: [1180, 2, "Slailios"],
                28: [1178, 4, "Laxios"],
                35: [553, 4, "Kagios"],
                36: [552, 2, "Whayxeos"],
                39: [328, 3, "Breisios"],
                40: [326, 1, "Esteuos"],
                42: [148, 3, "Foyeos"],
                43: [147, 1, "Urneitia"],
                48: [55, 2, "Snieltoos"],
                49: [53, 4, "Augheios"],
                50: [51, 1, "Loheos"],
                56: [114, 3, "Hazios"],
                57: [113, 4, "Jieliios"],
                59: [247, 1, "Soirios"],
                60: [244, 4, "Tejios"],
                61: [243, 3, "Smywios"],
                70: [699, 2, "Kineyos"],
                71: [700, 1, "Llouzios"],
                73: [1012, 4, "Toritia"],
                74: [1014, 2, "Diarios"],
                75: [1022, 3, "Peroios"],
                77: [1448, 1, "Asoios"],
                78: [1450, 3, "Smaveos"],
                84: [1888, 4, "Tasheios"],
                85: [1890, 2, "Hinietia"],
                91: [3073, 2, "Smurios"],
                92: [3072, 1, "Smeyqiios"],
                93: [3069, 2, "Trareos"],
                94: [3071, 4, "Nimios"],
                96: [3784, 3, "Tanetia"],
                97: [3786, 4, "Chaaeos"],
                98: [3787, 1, "Usteyos"],
                99: [3789, 3, "Athoetia"],
                100: [3791, 1, "Polaytia"]
            },
            55: {
                1: [4716, 2, "Undios"],
                2: [4715, 1, "Norios"],
                4: [4708, 4, "Rhourios"],
                5: [4707, 3, "Dirios"],
                7: [3449, 1, "Yiedios"],
                8: [3446, 2, "Cruifios"],
                15: [2688, 4, "Daulios"],
                16: [2686, 2, "Phaykaos"],
                21: [1659, 3, "Athoeos"],
                22: [1660, 4, "Honuos"],
                24: [1647, 4, "Rayoos"],
                25: [1648, 1, "Tasatia"],
                30: [842, 1, "Smiyaos"],
                31: [840, 2, "Sleanyios"],
                33: [558, 1, "Strounios"],
                34: [555, 2, "Peruitia"],
                35: [554, 1, "Yesaios"],
                36: [550, 3, "Ormatia"],
                37: [549, 4, "Waruios"],
                45: [136, 4, "Onaios"],
                46: [135, 3, "Rikios"],
                52: [119, 2, "Theriaos"],
                53: [117, 1, "Enthatia"],
                54: [115, 2, "Niseos"],
                59: [248, 3, "Kayios"],
                60: [246, 2, "Rhezios"],
                63: [263, 1, "Kinetia"],
                64: [265, 3, "Trihoios"],
                66: [446, 1, "Jainios"],
                67: [447, 2, "Vociios"],
                68: [457, 1, "Blietios"],
                73: [1015, 3, "Rothutia"],
                74: [1017, 1, "Jihios"],
                80: [1453, 3, "Potoos"],
                81: [1455, 4, "Blyvoos"],
                82: [1461, 2, "Dinios"],
                85: [1891, 3, "Snourios"],
                86: [1893, 1, "Deneyos"],
                88: [2387, 2, "Zidios"],
                89: [2388, 3, "Entheuos"],
                91: [3074, 3, "Issyos"],
                92: [3075, 4, "Dybios"],
                97: [3793, 3, "Myjios"],
                98: [3788, 2, "Oldeyos"],
                99: [3790, 4, "Ghautia"],
                100: [3792, 2, "Enayos"]
            },
            56: {
                4: [4705, 1, "Heuhios"],
                5: [4706, 2, "Thruhoos"],
                7: [3448, 4, "Broleos"],
                8: [3447, 3, "Jeumios"],
                10: [3439, 3, "Moseatia"],
                11: [3438, 1, "Phucios"],
                13: [2692, 4, "Schidoios"],
                14: [2690, 2, "Keluitia"],
                15: [2687, 3, "Bukuos"],
                16: [2685, 1, "Tiayos"],
                18: [2116, 3, "Syxios"],
                19: [2114, 1, "Dynaetia"],
                21: [1661, 1, "Fiekios"],
                22: [1662, 2, "Zhoosios"],
                24: [1650, 3, "Tygios"],
                25: [1649, 2, "Nipaos"],
                26: [1646, 1, "Lefios"],
                27: [1640, 2, "Cifios"],
                28: [1641, 1, "Taulios"],
                30: [843, 4, "Angios"],
                31: [841, 3, "Colaos"],
                33: [557, 4, "Dreseos"],
                34: [556, 3, "Bailoios"],
                36: [551, 2, "Devios"],
                37: [548, 1, "Rodutia"],
                38: [545, 4, "Ceylaios"],
                40: [325, 4, "Cobios"],
                41: [323, 2, "Ineeuos"],
                43: [142, 4, "Burytia"],
                44: [139, 2, "Iaaos"],
                45: [137, 1, "Revios"],
                46: [134, 2, "Croicios"],
                47: [131, 1, "Sesuios"],
                48: [128, 4, "Whaefios"],
                49: [127, 3, "Zoinios"],
                51: [121, 3, "Cocoos"],
                52: [120, 4, "Essyos"],
                53: [118, 3, "Veraos"],
                54: [116, 4, "Timeos"],
                55: [124, 1, "Aweetia"],
                57: [253, 2, "Halteios"],
                58: [250, 4, "Taieos"],
                59: [249, 1, "Burios"],
                62: [267, 2, "Rhelyios"],
                63: [264, 4, "Omyos"],
                64: [266, 2, "Nemios"],
                66: [448, 4, "Chriaciios"],
                67: [449, 3, "Balios"],
                68: [456, 4, "Etios"],
                70: [702, 1, "Breiyuos"],
                71: [703, 3, "Hanios"],
                73: [1016, 4, "Polyos"],
                74: [1018, 2, "Sworryos"],
                76: [1023, 4, "Voltuos"],
                77: [1025, 2, "Chrigiios"],
                79: [1457, 4, "Aleoos"],
                80: [1454, 2, "Colyios"],
                81: [1456, 1, "Thirios"],
                82: [1460, 3, "Rhitaos"],
                83: [1462, 2, "Sulauos"],
                85: [1892, 4, "Angutia"],
                86: [1894, 2, "Quaaos"],
                88: [2389, 4, "Phiejeios"],
                89: [2390, 1, "Hojios"],
                91: [3076, 2, "Skelaos"],
                92: [3077, 1, "Bezios"],
                94: [3086, 1, "Rinaos"],
                95: [3087, 4, "Queyos"],
                97: [3794, 4, "Gychuios"],
                98: [3795, 1, "Lebios"]
            },
            57: {
                3: [4704, 4, "Achoios"],
                4: [4703, 3, "Broenaios"],
                10: [3436, 4, "Luteios"],
                11: [3437, 2, "Ageeos"],
                13: [2691, 3, "Ashotia"],
                14: [2689, 1, "Ardetia"],
                15: [2684, 4, "Echoitia"],
                16: [2682, 2, "Whiltyios"],
                18: [2115, 2, "Staxios"],
                19: [2113, 4, "Zheliios"],
                26: [1651, 3, "Mocios"],
                27: [1642, 4, "Aleotia"],
                28: [1643, 3, "Feibios"],
                30: [846, 1, "Nohyos"],
                31: [844, 2, "Samyos"],
                37: [547, 2, "Febios"],
                38: [546, 3, "Nukios"],
                40: [324, 3, "Ingauos"],
                41: [322, 1, "Untatia"],
                43: [141, 1, "Blinaios"],
                44: [140, 3, "Llaynios"],
                46: [133, 3, "Verotia"],
                47: [132, 4, "Sepaios"],
                48: [130, 2, "Schiluios"],
                49: [129, 1, "Oreatia"],
                51: [122, 1, "Schilios"],
                52: [123, 2, "Lutuios"],
                54: [126, 2, "Soubyos"],
                55: [125, 3, "Urnieos"],
                57: [254, 1, "Smuruios"],
                58: [252, 3, "Blujios"],
                59: [262, 2, "Wurios"],
                61: [270, 3, "Tanuos"],
                62: [268, 4, "Ramiios"],
                63: [269, 3, "Kelaos"],
                66: [450, 2, "Slisios"],
                67: [451, 1, "Onyos"],
                70: [704, 2, "Baubios"],
                71: [705, 4, "Zockyios"],
                73: [1019, 1, "Blookios"],
                74: [1020, 3, "Slicoios"],
                76: [1024, 1, "Ineeaos"],
                77: [1026, 3, "Tietios"],
                79: [1458, 1, "Oldauos"],
                80: [1459, 3, "Rakeetia"],
                82: [1464, 4, "Swieyios"],
                83: [1463, 1, "Endoitia"],
                85: [1895, 3, "Dresiios"],
                86: [1897, 1, "Layyios"],
                88: [2391, 2, "Ineeitia"],
                89: [2392, 3, "Throlios"],
                94: [3083, 3, "Rayoios"],
                95: [3084, 2, "Tiniatia"]
            },
            58: {
                3: [4702, 2, "Ponoos"],
                4: [4701, 1, "Phovios"],
                6: [4092, 2, "Nyeutia"],
                7: [4093, 1, "Quojaios"],
                9: [3434, 2, "Creubios"],
                10: [3435, 3, "Tutheos"],
                15: [2683, 3, "Ryneytia"],
                16: [2681, 1, "Kohios"],
                18: [2112, 3, "Clohoios"],
                19: [2110, 1, "Tovios"],
                21: [2107, 4, "Gouhios"],
                22: [2106, 1, "Nyseuos"],
                23: [2103, 4, "Riateios"],
                24: [2102, 1, "Meartuios"],
                27: [1644, 2, "Pealios"],
                28: [1645, 1, "Thrylios"],
                30: [847, 4, "Moreatia"],
                31: [845, 3, "Queaeos"],
                33: [838, 1, "Isseatia"],
                34: [832, 3, "Nyrios"],
                35: [830, 1, "Garoetia"],
                40: [321, 4, "Criroios"],
                41: [319, 2, "Drodios"],
                61: [271, 1, "Mieciios"],
                62: [272, 2, "Engetia"],
                63: [273, 1, "Zhaysios"],
                65: [453, 1, "Yebios"],
                66: [452, 4, "Anios"],
                69: [710, 4, "Llighoos"],
                70: [706, 1, "Ryneos"],
                76: [1027, 4, "Schalaos"],
                77: [1029, 2, "Quoetios"],
                85: [1896, 4, "Throyyios"],
                86: [1898, 2, "Tryreios"],
                88: [2393, 4, "Swekios"],
                89: [2394, 1, "Nifios"],
                90: [2395, 2, "Dexaos"],
                92: [3078, 4, "Saireos"],
                93: [3080, 2, "Stewyios"],
                94: [3082, 4, "Trakoios"],
                95: [3085, 1, "Whuthuios"],
                97: [3803, 2, "Slihuos"],
                98: [3804, 3, "Pyfios"]
            },
            59: {
                3: [4700, 4, "Cineios"],
                4: [4699, 3, "Atheaos"],
                6: [4091, 4, "Bosios"],
                7: [4090, 3, "Chuidios"],
                9: [3432, 4, "Reniios"],
                10: [3433, 1, "Zhodios"],
                12: [2679, 4, "Thrasios"],
                13: [2680, 1, "Pibios"],
                18: [2111, 2, "Clifeios"],
                19: [2109, 4, "Sleezios"],
                21: [2108, 2, "Sulaios"],
                22: [2105, 3, "Turitia"],
                23: [2104, 2, "Emoetia"],
                24: [2101, 3, "Dakeios"],
                25: [2098, 4, "Dozoios"],
                30: [849, 1, "Croissyios"],
                31: [848, 2, "Closios"],
                33: [839, 2, "Jenoos"],
                34: [833, 4, "Sougaios"],
                35: [831, 2, "Nomoos"],
                37: [544, 4, "Hineos"],
                38: [540, 1, "Yasios"],
                40: [320, 3, "Schayrios"],
                41: [318, 1, "Pewios"],
                42: [315, 3, "Inaoeos"],
                43: [313, 1, "Gievaios"],
                45: [311, 2, "Horios"],
                46: [309, 4, "Taiuios"],
                47: [307, 2, "Whoriios"],
                48: [305, 4, "Romeios"],
                50: [303, 2, "Sishaios"],
                51: [302, 3, "Dririos"],
                52: [295, 4, "Fycios"],
                53: [293, 1, "Lyrtoios"],
                55: [285, 2, "Pynneios"],
                56: [282, 4, "Etutia"],
                58: [275, 2, "Quaotia"],
                59: [274, 1, "Mudios"],
                65: [454, 2, "Delietia"],
                66: [455, 3, "Anuos"],
                68: [712, 2, "Enautia"],
                69: [711, 3, "Cheios"],
                70: [708, 2, "Dynaos"],
                72: [719, 1, "Ightoitia"],
                73: [721, 2, "Oldyos"],
                75: [1031, 3, "Hezios"],
                76: [1028, 1, "Saitoos"],
                77: [1030, 3, "Thraenuios"],
                79: [1465, 2, "Orutia"],
                80: [1466, 3, "Issoios"],
                82: [1477, 3, "Threydios"],
                83: [1478, 1, "Straibaos"],
                89: [2397, 4, "Lyhoos"],
                90: [2396, 3, "Koteos"],
                92: [3079, 3, "Echuos"],
                93: [3081, 1, "Urnotia"],
                97: [3802, 1, "Schoebios"],
                98: [3805, 4, "Perios"]
            },
            60: {
                6: [4089, 2, "Sliatios"],
                7: [4088, 1, "Joghoos"],
                12: [2678, 3, "Roduos"],
                13: [2677, 2, "Haulios"],
                14: [2675, 4, "Eldetia"],
                15: [2673, 2, "Phapaios"],
                16: [2671, 4, "Boolyios"],
                24: [2100, 2, "Omautia"],
                25: [2099, 1, "Warteios"],
                27: [1638, 3, "Biphuios"],
                28: [1639, 1, "Estatia"],
                34: [834, 1, "Essuios"],
                35: [836, 3, "Jetios"],
                37: [538, 2, "Saukoos"],
                38: [539, 3, "Ineiaos"],
                42: [316, 4, "Aratia"],
                43: [314, 2, "Eraeos"],
                45: [312, 3, "Ageitia"],
                46: [310, 1, "Liseios"],
                47: [308, 3, "Buratia"],
                48: [306, 1, "Kelatia"],
                50: [304, 4, "Lahaos"],
                51: [301, 1, "Curiios"],
                52: [296, 3, "Gupheios"],
                53: [294, 2, "Undytia"],
                55: [286, 3, "Blixios"],
                56: [283, 1, "Llorios"],
                58: [276, 3, "Schimios"],
                59: [277, 4, "Redaos"],
                60: [278, 2, "Eldoos"],
                62: [458, 2, "Chriryios"],
                63: [459, 3, "Polios"],
                68: [713, 4, "Liliios"],
                69: [714, 1, "Riloios"],
                72: [720, 3, "Poloitia"],
                73: [722, 4, "Slabios"],
                75: [1032, 4, "Schinios"],
                76: [1033, 2, "Rooteos"],
                79: [1467, 4, "Ageuitia"],
                80: [1468, 1, "Rexaos"],
                82: [1479, 2, "Streudoios"],
                83: [1480, 4, "Dypiios"],
                84: [1483, 2, "Rothaios"],
                86: [1900, 1, "Seyeos"],
                87: [1902, 4, "Smoiluios"],
                95: [3796, 3, "Traerios"],
                96: [3798, 1, "Culuios"],
                97: [3800, 3, "Asitia"]
            },
            61: {
                3: [4691, 2, "Burietia"],
                4: [4690, 1, "Lialios"],
                6: [4087, 3, "Queylios"],
                7: [4086, 4, "Untuos"],
                9: [3427, 3, "Swauphaos"],
                10: [3426, 1, "Pedios"],
                13: [2676, 1, "Hataitia"],
                14: [2674, 3, "Eldotia"],
                15: [2672, 1, "Mackios"],
                16: [2670, 3, "Steasios"],
                18: [2661, 1, "Vupios"],
                19: [2660, 4, "Shyoios"],
                21: [2669, 3, "Rakitia"],
                22: [2667, 2, "Smuicios"],
                27: [1637, 2, "Kesoios"],
                28: [1635, 4, "Daruos"],
                29: [1636, 1, "Roitios"],
                31: [1172, 3, "Banaos"],
                32: [1171, 4, "Hateeos"],
                34: [835, 2, "Trosios"],
                35: [837, 4, "Neykuos"],
                37: [537, 1, "Eldeatia"],
                38: [536, 4, "Bocyios"],
                39: [535, 1, "Cepaios"],
                40: [532, 3, "Clekoos"],
                51: [298, 2, "Rejios"],
                52: [297, 4, "Voikios"],
                55: [287, 4, "Nodios"],
                56: [288, 2, "Testios"],
                58: [281, 4, "Kavios"],
                59: [279, 1, "Radeos"],
                60: [280, 3, "Enthuitia"],
                62: [460, 4, "Yinios"],
                63: [461, 1, "Estoetia"],
                64: [462, 4, "Itios"],
                65: [465, 1, "Athaos"],
                67: [715, 2, "Verios"],
                68: [716, 3, "Phihyos"],
                71: [723, 1, "Ceryos"],
                72: [724, 2, "Tuhyios"],
                78: [1469, 2, "Lubios"],
                79: [1470, 3, "Taneetia"],
                80: [1476, 2, "Tysuios"],
                82: [1481, 1, "Undootia"],
                83: [1482, 3, "Baneitia"],
                84: [1484, 1, "Wheufeios"],
                86: [1901, 2, "Schegios"],
                87: [1899, 3, "Lleurios"],
                89: [2398, 2, "Inaios"],
                90: [2399, 3, "Lakoios"],
                92: [3088, 1, "Theroitia"],
                93: [3090, 3, "Vereos"],
                95: [3797, 4, "Rothetia"],
                96: [3799, 2, "Itoeos"],
                97: [3801, 4, "Shyytia"],
                99: [3806, 3, "Giloios"],
                100: [3808, 1, "Emiatia"]
            },
            62: {
                3: [4689, 4, "Clontuos"],
                4: [4688, 3, "Croiwuios"],
                6: [4085, 2, "Blaucios"],
                7: [4084, 1, "Jemuios"],
                9: [3428, 2, "Torouos"],
                10: [3425, 4, "Bliyios"],
                11: [3423, 2, "Taerios"],
                18: [2659, 3, "Athoitia"],
                19: [2658, 2, "Votios"],
                21: [2668, 1, "Cidaios"],
                22: [2666, 4, "Erios"],
                24: [2091, 3, "Rhidios"],
                25: [2090, 2, "Whaybios"],
                28: [1633, 2, "Torutia"],
                29: [1634, 3, "Pierdios"],
                31: [1170, 1, "Lunoios"],
                32: [1169, 2, "Emootia"],
                39: [534, 2, "Blunios"],
                40: [533, 4, "Tyraios"],
                42: [512, 1, "Sayios"],
                43: [510, 3, "Hairaios"],
                44: [508, 1, "Phidios"],
                45: [506, 3, "Dreeldoios"],
                47: [502, 2, "Buvios"],
                48: [500, 4, "Angaios"],
                49: [498, 2, "Queoos"],
                51: [299, 3, "Honyos"],
                52: [300, 1, "Teabios"],
                54: [289, 3, "Kyrios"],
                55: [290, 1, "Eldiatia"],
                63: [464, 2, "Kepyios"],
                64: [463, 3, "Smoyios"],
                65: [466, 2, "Swamios"],
                67: [717, 4, "Tyghaos"],
                68: [718, 1, "Setios"],
                70: [727, 2, "Banootia"],
                71: [726, 4, "Stiloios"],
                72: [725, 3, "Dijios"],
                74: [1034, 4, "Denotia"],
                75: [1035, 1, "Meedios"],
                77: [1473, 2, "Bruhios"],
                78: [1471, 4, "Baneatia"],
                79: [1472, 1, "Neytios"],
                86: [1903, 4, "Shaylyos"],
                87: [1904, 1, "Tonaos"],
                89: [2400, 4, "Deinuos"],
                90: [2401, 1, "Ustios"],
                92: [3089, 2, "Theuvios"],
                93: [3091, 4, "Stroxuios"],
                99: [3807, 4, "Estoos"],
                100: [3809, 2, "Whomios"]
            },
            63: {
                2: [4696, 1, "Ackaios"],
                3: [4687, 2, "Snianaios"],
                4: [4686, 1, "Driyoos"],
                9: [3429, 1, "Nyriios"],
                10: [3424, 3, "Yiesios"],
                11: [3422, 1, "Shyiatia"],
                13: [3416, 4, "Yaihios"],
                14: [3414, 2, "Dunoios"],
                15: [3412, 4, "Ustatia"],
                16: [3410, 2, "Segios"],
                18: [2657, 1, "Honeytia"],
                19: [2656, 4, "Taeraos"],
                21: [2665, 2, "Shyietia"],
                22: [2662, 3, "Phokios"],
                24: [2092, 4, "Tarios"],
                25: [2089, 1, "Quucoos"],
                26: [2087, 3, "Hycios"],
                28: [1631, 4, "Soneios"],
                29: [1632, 1, "Schiekyios"],
                31: [1167, 2, "Kiyyios"],
                32: [1165, 4, "Umatia"],
                33: [1163, 2, "Gareatia"],
                34: [1161, 3, "Chrahios"],
                36: [820, 2, "Angitia"],
                37: [818, 4, "Bealios"],
                42: [513, 2, "Niryos"],
                43: [511, 4, "Gidios"],
                44: [509, 2, "Zharaos"],
                45: [507, 4, "Eneuos"],
                47: [503, 1, "Echooos"],
                48: [501, 3, "Ightios"],
                49: [499, 1, "Lohios"],
                54: [292, 2, "Kineuos"],
                55: [291, 4, "Banoios"],
                57: [475, 2, "Samuios"],
                58: [472, 3, "Slaxios"],
                59: [471, 2, "Cymios"],
                60: [468, 3, "Nozeios"],
                61: [467, 1, "Shuiseos"],
                70: [728, 3, "Smeebios"],
                71: [729, 1, "Vorietia"],
                72: [730, 2, "Onotia"],
                74: [1036, 2, "Taiytia"],
                75: [1037, 3, "Rheyrios"],
                77: [1474, 1, "Kaxios"],
                78: [1475, 3, "Kygiios"],
                81: [1485, 2, "Rothaytia"],
                82: [1486, 4, "Aldouos"],
                84: [1909, 2, "Queayos"],
                85: [1907, 4, "Chileos"],
                86: [1905, 2, "Smelios"],
                89: [2402, 2, "Elmootia"],
                90: [2403, 3, "Ightyos"],
                92: [3092, 1, "Snareios"],
                93: [3093, 2, "Barios"],
                94: [3094, 3, "Sekios"],
                95: [3096, 1, "Stumios"],
                96: [3098, 3, "Bocios"],
                98: [3812, 1, "Lyrios"],
                99: [3810, 3, "Kanios"]
            },
            64: {
                1: [4693, 4, "Seileios"],
                2: [4692, 3, "Drauos"],
                3: [4685, 4, "Riceos"],
                4: [4684, 3, "Liedios"],
                6: [4079, 4, "Atutia"],
                7: [4077, 2, "Anyos"],
                9: [3430, 4, "Staghaios"],
                10: [3431, 2, "Roodios"],
                13: [3417, 1, "Inaatia"],
                14: [3415, 3, "Ineoos"],
                15: [3413, 1, "Nokeos"],
                16: [3411, 3, "Pamios"],
                18: [2655, 3, "Queeos"],
                19: [2654, 2, "Nabaos"],
                21: [2664, 1, "Nooleos"],
                22: [2663, 4, "Whuraios"],
                25: [2088, 4, "Morotia"],
                26: [2086, 2, "Myyeios"],
                31: [1168, 1, "Trixuos"],
                32: [1166, 3, "Issoos"],
                33: [1164, 1, "Leruitia"],
                34: [1162, 4, "Baneeos"],
                36: [821, 3, "Blinios"],
                37: [819, 1, "Bacios"],
                38: [816, 2, "Menyos"],
                39: [814, 4, "Ritios"],
                41: [514, 3, "Ryniaos"],
                42: [515, 4, "Tessoios"],
                43: [518, 3, "Riseaos"],
                48: [505, 2, "Oraos"],
                49: [504, 4, "Ighteos"],
                51: [487, 2, "Crymios"],
                52: [486, 4, "Quauos"],
                57: [476, 3, "Ravios"],
                58: [473, 4, "Snexios"],
                59: [474, 1, "Cheymeos"],
                60: [469, 4, "Rigios"],
                61: [470, 2, "Stathaios"],
                63: [740, 1, "Lydiios"],
                64: [741, 4, "Queitia"],
                66: [735, 2, "Kelauos"],
                67: [731, 1, "Dielios"],
                68: [732, 2, "Toneitia"],
                74: [1038, 4, "Atoos"],
                75: [1039, 1, "Angootia"],
                80: [1489, 2, "Vyreios"],
                81: [1487, 3, "Brugoos"],
                82: [1488, 1, "Sleryios"],
                84: [1910, 3, "Aweitia"],
                85: [1908, 1, "Schaloos"],
                86: [1906, 3, "Strazoios"],
                88: [2404, 4, "Riseos"],
                89: [2405, 1, "Throoyios"],
                94: [3095, 4, "Inaetia"],
                95: [3097, 2, "Kalyos"],
                96: [3099, 4, "Jeipios"],
                98: [3813, 2, "Ryceos"],
                99: [3811, 4, "Bleloos"]
            },
            65: {
                1: [4695, 2, "Harios"],
                2: [4694, 1, "Coennuos"],
                6: [4078, 3, "Swiathoos"],
                7: [4076, 1, "Blarios"],
                12: [3421, 1, "Luliios"],
                13: [3418, 2, "Quoinyios"],
                18: [2653, 1, "Nofaios"],
                19: [2652, 4, "Cheitia"],
                24: [2097, 2, "Chezeos"],
                25: [2085, 3, "Garaos"],
                26: [2083, 1, "Lyraios"],
                28: [1629, 1, "Syhios"],
                29: [1630, 2, "Ightayos"],
                38: [817, 3, "Ineios"],
                39: [815, 1, "Llourios"],
                41: [517, 2, "Umaos"],
                42: [516, 1, "Noetuos"],
                45: [519, 1, "Nicios"],
                46: [520, 2, "Jeygios"],
                51: [488, 3, "Ineotia"],
                52: [489, 1, "Creyyeios"],
                54: [478, 3, "Ackuios"],
                55: [477, 2, "Elmyos"],
                63: [743, 2, "Dynyos"],
                64: [742, 3, "Samotia"],
                66: [736, 3, "Wicios"],
                67: [734, 4, "Tesoos"],
                68: [733, 3, "Rapios"],
                69: [737, 1, "Rakaos"],
                71: [1045, 2, "Oldautia"],
                72: [1046, 3, "Shahios"],
                74: [1040, 2, "Endietia"],
                75: [1041, 3, "Smadios"],
                76: [1042, 4, "Yerios"],
                78: [1495, 4, "Lonoos"],
                79: [1492, 3, "Lealuos"],
                80: [1490, 4, "Thrunios"],
                81: [1491, 1, "Segheios"],
                88: [2406, 2, "Nyvaios"],
                89: [2407, 3, "Ardeuos"],
                91: [3101, 2, "Hiyios"],
                92: [3100, 1, "Queotia"]
            },
            66: {
                4: [4083, 1, "Mosyos"],
                5: [4081, 3, "Ightoutia"],
                6: [4075, 4, "Tinatia"],
                7: [4073, 2, "Adytia"],
                9: [4058, 4, "Mesaos"],
                10: [4057, 3, "Llesios"],
                12: [3420, 4, "Thomios"],
                13: [3419, 3, "Tonayos"],
                15: [3407, 1, "Losaios"],
                16: [3406, 3, "Tinyos"],
                19: [2651, 3, "Wedios"],
                20: [2649, 1, "Voroios"],
                21: [2647, 3, "Ustoetia"],
                23: [2096, 4, "Breabios"],
                24: [2093, 1, "Claijaios"],
                25: [2084, 4, "Sylyios"],
                26: [2082, 2, "Skelyos"],
                28: [1628, 4, "Vorios"],
                29: [1627, 3, "Kalotia"],
                30: [1626, 2, "Nysyos"],
                32: [1159, 4, "Memios"],
                33: [1157, 2, "Dobios"],
                34: [1155, 4, "Decaos"],
                35: [1153, 2, "Emeyos"],
                37: [822, 4, "Scheytios"],
                38: [823, 2, "Jeavios"],
                39: [826, 4, "Botiios"],
                44: [523, 2, "Seavios"],
                45: [522, 4, "Snonteios"],
                46: [521, 3, "Thyzios"],
                47: [526, 2, "Kaloetia"],
                48: [527, 3, "Aseos"],
                49: [528, 2, "Rukios"],
                51: [492, 4, "Nolyos"],
                52: [490, 2, "Ingytia"],
                54: [479, 4, "Polieos"],
                55: [480, 1, "Shaumoios"],
                56: [481, 2, "Kumios"],
                57: [484, 1, "Aleatia"],
                59: [753, 3, "Bearoios"],
                60: [752, 2, "Zuiryos"],
                62: [746, 1, "Laecios"],
                63: [744, 3, "Tounios"],
                68: [739, 2, "Torios"],
                69: [738, 4, "Yeruos"],
                71: [1047, 4, "Phedios"],
                72: [1048, 1, "Ildotia"],
                75: [1043, 1, "Sligios"],
                76: [1044, 2, "Ormootia"],
                78: [1496, 1, "Realyos"],
                79: [1493, 2, "Drutios"],
                80: [1494, 3, "Zalaos"],
                81: [1497, 2, "Nasios"],
                83: [1911, 2, "Smevaos"],
                84: [1912, 3, "Esteeos"],
                86: [2412, 4, "Buroutia"],
                87: [2409, 1, "Urnitia"],
                88: [2408, 4, "Stamuos"],
                91: [3103, 4, "Wonoos"],
                92: [3102, 3, "Ageouos"],
                94: [3120, 4, "Risyos"],
                95: [3122, 3, "Kaizaos"],
                97: [3814, 4, "Texios"],
                98: [3815, 1, "Chruruios"]
            },
            67: {
                1: [5141, 1, "Raphaos"],
                2: [5142, 2, "Tiephyos"],
                4: [4082, 4, "Dartios"],
                5: [4080, 2, "Cheaitia"],
                6: [4074, 1, "Vutuos"],
                7: [4072, 3, "Elmios"],
                9: [4059, 1, "Ingeaos"],
                10: [4056, 2, "Rakayos"],
                15: [3401, 2, "Yeygaios"],
                16: [3399, 4, "Ematia"],
                17: [3397, 2, "Emooos"],
                19: [2650, 2, "Pheixios"],
                20: [2648, 4, "Sorios"],
                21: [2646, 2, "Trixios"],
                23: [2095, 3, "Tuzios"],
                24: [2094, 2, "Ackootia"],
                29: [1625, 1, "Thraynyos"],
                30: [1624, 4, "Cibios"],
                32: [1160, 1, "Riesaos"],
                33: [1158, 3, "Rhyseios"],
                34: [1156, 1, "Batios"],
                35: [1154, 3, "Raideos"],
                37: [825, 1, "Smayhios"],
                38: [824, 3, "Thryyios"],
                39: [827, 1, "Urnoos"],
                41: [803, 4, "Oroutia"],
                42: [801, 2, "Denootia"],
                44: [524, 1, "Thifios"],
                45: [525, 3, "Uskeos"],
                47: [531, 1, "Rydiios"],
                48: [530, 4, "Ustoios"],
                49: [529, 1, "Essuitia"],
                51: [493, 1, "Sayatia"],
                52: [491, 3, "Phatios"],
                55: [482, 3, "Wouhios"],
                56: [483, 4, "Naezios"],
                57: [485, 2, "Inaouos"],
                59: [755, 4, "Itotia"],
                60: [754, 1, "Steciios"],
                62: [747, 2, "Awoetia"],
                63: [745, 4, "Enthuos"],
                65: [1054, 1, "Thucaios"],
                66: [1055, 2, "Riatiios"],
                72: [1049, 2, "Chomeios"],
                73: [1050, 3, "Tasios"],
                83: [1913, 4, "Phupaos"],
                84: [1914, 1, "Nilloos"],
                86: [2413, 2, "Boesios"],
                87: [2411, 3, "Delitia"],
                88: [2410, 2, "Rotheyos"],
                90: [3111, 2, "Cridios"],
                91: [3110, 1, "Tadios"],
                94: [3121, 2, "Chraynios"],
                95: [3123, 1, "Elmatia"],
                97: [3816, 2, "Dounios"],
                98: [3817, 3, "Anoos"]
            },
            68: {
                1: [5139, 3, "Denoos"],
                2: [5140, 4, "Tilios"],
                10: [4055, 4, "Lanios"],
                11: [4054, 2, "Kimeuos"],
                13: [3405, 2, "Thriagios"],
                14: [3402, 3, "Zhaixeios"],
                15: [3400, 1, "Aldios"],
                16: [3398, 3, "Stanyos"],
                17: [3396, 1, "Yeroos"],
                26: [2076, 1, "Sulitia"],
                27: [2074, 3, "Zaleos"],
                29: [1623, 3, "Osaeos"],
                30: [1622, 2, "Brisios"],
                38: [829, 4, "Rizeios"],
                39: [828, 2, "Thralios"],
                41: [804, 1, "Roinaos"],
                42: [802, 3, "Foeneos"],
                52: [497, 1, "Faecios"],
                53: [494, 2, "Viamios"],
                59: [757, 2, "Deldaios"],
                60: [756, 3, "Treehios"],
                65: [1056, 4, "Hoifios"],
                66: [1057, 3, "Kaekaos"],
                68: [1064, 1, "Cafios"],
                69: [1065, 2, "Brautiios"],
                70: [1068, 1, "Swosaios"],
                72: [1051, 4, "Sedios"],
                73: [1052, 1, "Chrerreios"],
                75: [1506, 4, "Threruos"],
                76: [1504, 1, "Yytyios"],
                77: [1502, 3, "Borios"],
                78: [1500, 2, "Crihoos"],
                79: [1498, 3, "Wecios"],
                81: [1919, 4, "Chrerios"],
                82: [1916, 3, "Swaniios"],
                83: [1915, 2, "Kienduos"],
                90: [3112, 3, "Tonutia"],
                91: [3113, 4, "Cusoios"],
                93: [3125, 2, "Jupios"],
                94: [3124, 4, "Delaos"],
                97: [3818, 4, "Heigoios"]
            },
            69: {
                1: [5137, 1, "Reneos"],
                2: [5138, 2, "Rhierios"],
                4: [4671, 4, "Snithiios"],
                5: [4669, 2, "Rolios"],
                7: [4071, 3, "Bofaios"],
                8: [4070, 1, "Zowios"],
                10: [4053, 3, "Mymeos"],
                11: [4051, 1, "Risatia"],
                13: [3404, 1, "Siraios"],
                14: [3403, 4, "Slaluios"],
                19: [2645, 1, "Ormetia"],
                20: [2644, 3, "Laesios"],
                21: [2639, 2, "Disios"],
                22: [2637, 3, "Eldaeos"],
                24: [2080, 1, "Chyckoos"],
                25: [2078, 3, "Llefeios"],
                26: [2077, 2, "Snynuios"],
                27: [2075, 4, "Mucios"],
                29: [1621, 1, "Llosios"],
                30: [1620, 4, "Eldautia"],
                32: [1612, 4, "Readeos"],
                33: [1610, 2, "Slumaios"],
                35: [1148, 3, "Rakeyos"],
                36: [1145, 4, "Chaetia"],
                41: [807, 2, "Queyfios"],
                42: [809, 4, "Chardiios"],
                44: [795, 2, "Rayeatia"],
                45: [793, 4, "Zukyos"],
                46: [791, 2, "Deleios"],
                47: [789, 4, "Bluldios"],
                49: [783, 3, "Snefios"],
                50: [781, 2, "Roorios"],
                52: [496, 4, "Aldeatia"],
                53: [495, 3, "Stutaios"],
                55: [767, 1, "Hukios"],
                56: [766, 3, "Omauos"],
                57: [763, 2, "Chredeios"],
                59: [758, 1, "Voriios"],
                60: [759, 4, "Ackoeos"],
                61: [760, 1, "Doedyios"],
                63: [1062, 2, "Worautia"],
                64: [1058, 3, "Clatios"],
                65: [1059, 1, "Dubios"],
                68: [1066, 3, "Reerdoos"],
                69: [1067, 4, "Aldiatia"],
                70: [1069, 2, "Goneios"],
                75: [1507, 3, "Arayos"],
                76: [1505, 2, "Adautia"],
                77: [1503, 4, "Enoios"],
                78: [1501, 1, "Keewios"],
                79: [1499, 4, "Ustyos"],
                81: [1920, 2, "Endatia"],
                82: [1918, 1, "Engios"],
                83: [1917, 4, "Rhiphaios"],
                85: [2414, 3, "Vowaos"],
                86: [2415, 4, "Hinoos"],
                88: [3116, 3, "Desuios"],
                89: [3115, 2, "Ardutia"],
                90: [3114, 1, "Zifuos"],
                93: [3126, 1, "Snureios"],
                94: [3127, 3, "Cheatia"],
                96: [3820, 2, "Ackaos"],
                97: [3819, 1, "Nysiatia"],
                99: [4427, 2, "Tryvios"],
                100: [4428, 3, "Ightaytia"]
            },
            70: {
                1: [5135, 3, "Luzeios"],
                2: [5136, 4, "Cykoos"],
                4: [4672, 1, "Beucaios"],
                5: [4670, 3, "Thruxios"],
                7: [4069, 2, "Phirroios"],
                8: [4068, 4, "Luirdiios"],
                10: [4052, 2, "Theraitia"],
                11: [4050, 4, "Tanoitia"],
                16: [3389, 3, "Nocios"],
                17: [3387, 1, "Tytios"],
                19: [2642, 2, "Dooxios"],
                20: [2640, 4, "Tietoos"],
                21: [2638, 1, "Lleikaios"],
                22: [2636, 4, "Hyphuos"],
                24: [2081, 2, "Schuroios"],
                25: [2079, 4, "Raisiios"],
                32: [1613, 1, "Dreynios"],
                33: [1611, 3, "Trecios"],
                35: [1147, 2, "Rayaytia"],
                36: [1146, 1, "Chraymios"],
                37: [1144, 3, "Nyutia"],
                38: [1141, 4, "Iroos"],
                40: [812, 1, "Camios"],
                41: [808, 3, "Kinotia"],
                42: [810, 1, "Dilaos"],
                44: [796, 3, "Echotia"],
                45: [794, 1, "Cukios"],
                46: [792, 3, "Aruos"],
                47: [790, 1, "Kaisios"],
                49: [784, 4, "Huyios"],
                50: [782, 1, "Echyos"],
                55: [768, 2, "Kahyos"],
                56: [765, 4, "Adaitia"],
                57: [764, 1, "Mosaytia"],
                60: [762, 3, "Eroios"],
                61: [761, 2, "Inautia"],
                63: [1063, 1, "Quorios"],
                64: [1060, 4, "Zhusaios"],
                65: [1061, 2, "Lloyios"],
                67: [1070, 3, "Sussaios"],
                68: [1071, 2, "Breafuios"],
                72: [1509, 1, "Hineios"],
                73: [1508, 4, "Nepios"],
                85: [2416, 1, "Dayvios"],
                86: [2417, 2, "Creesoos"],
                88: [3118, 1, "Osooos"],
                89: [3117, 4, "Ceipaios"],
                90: [3119, 3, "Dikyos"],
                92: [3129, 1, "Shoivios"],
                93: [3128, 4, "Endauos"],
                94: [3132, 2, "Sesaos"],
                96: [3822, 4, "Tokios"],
                97: [3821, 3, "Doiwaios"],
                99: [4429, 4, "Saldoios"],
                100: [4430, 1, "Tukios"]
            },
            71: {
                1: [5133, 1, "Dreroios"],
                2: [5134, 2, "Hotoios"],
                4: [4675, 4, "Rodaios"],
                5: [4673, 2, "Esteos"],
                7: [4067, 1, "Wheygios"],
                8: [4066, 3, "Seynoios"],
                11: [4048, 2, "Thrayhios"],
                12: [4046, 4, "Blihios"],
                14: [3392, 2, "Stashoos"],
                15: [3390, 4, "Smeymios"],
                16: [3388, 2, "Chromiios"],
                17: [3386, 4, "Hineaos"],
                19: [2643, 3, "Queaos"],
                20: [2641, 1, "Aleoetia"],
                27: [2068, 3, "Warautia"],
                28: [2060, 1, "Estitia"],
                30: [1618, 2, "Asheos"],
                31: [1616, 4, "Siereos"],
                32: [1614, 2, "Achutia"],
                37: [1143, 2, "Neirios"],
                38: [1142, 1, "Oseuos"],
                40: [813, 4, "Retios"],
                41: [811, 2, "Omutia"],
                46: [800, 2, "Athytia"],
                47: [799, 4, "Staltaos"],
                49: [786, 2, "Phogoios"],
                50: [785, 3, "Acheyos"],
                52: [776, 1, "Droorios"],
                53: [773, 2, "Kinuos"],
                57: [769, 3, "Royios"],
                58: [771, 2, "Engoios"],
                67: [1072, 1, "Cereos"],
                68: [1073, 4, "Mypuios"],
                70: [1513, 1, "Rishuos"],
                71: [1512, 4, "Chriphuios"],
                72: [1510, 2, "Nayaios"],
                73: [1511, 3, "Zheywoos"],
                74: [1516, 4, "Snaunios"],
                76: [1933, 1, "Brosios"],
                77: [1934, 2, "Kiawios"],
                79: [1926, 2, "Isaitia"],
                80: [1925, 1, "Tririos"],
                81: [1922, 2, "Lysuios"],
                82: [1921, 1, "Rakeos"],
                84: [2419, 4, "Pereitia"],
                85: [2418, 3, "Whykios"],
                92: [3130, 2, "Nyeos"],
                93: [3131, 3, "Sylios"],
                94: [3133, 1, "Tixios"],
                99: [4431, 2, "Hataos"],
                100: [4432, 3, "Bleyroios"]
            },
            72: {
                4: [4676, 1, "Slynios"],
                5: [4674, 3, "Ormotia"],
                8: [4064, 4, "Chricyos"],
                9: [4062, 1, "Eldeeos"],
                11: [4049, 3, "Ribios"],
                12: [4047, 1, "Caykios"],
                14: [3393, 3, "Bituos"],
                15: [3391, 1, "Umutia"],
                22: [2631, 2, "Estutia"],
                23: [2629, 4, "Rakyos"],
                24: [2627, 2, "Waruos"],
                25: [2625, 4, "Whegios"],
                27: [2069, 4, "Cliraios"],
                28: [2061, 2, "Iaeyos"],
                30: [1619, 3, "Reunyios"],
                31: [1617, 1, "Dossoios"],
                32: [1615, 3, "Raynios"],
                34: [1602, 4, "Negoos"],
                35: [1600, 2, "Gipios"],
                37: [1149, 4, "Cheshiios"],
                38: [1150, 3, "Slatios"],
                43: [1131, 4, "Sluzios"],
                44: [1130, 2, "Nautoos"],
                49: [788, 4, "Nyitia"],
                50: [787, 1, "Naylaios"],
                52: [775, 4, "Shotios"],
                53: [774, 3, "Stuinios"],
                54: [780, 1, "Rihyos"],
                55: [777, 3, "Moreyos"],
                57: [770, 4, "Silios"],
                58: [772, 1, "Rhulios"],
                60: [1088, 3, "Aleeos"],
                61: [1086, 1, "Soixios"],
                62: [1083, 2, "Yeritia"],
                64: [1074, 1, "Mepios"],
                65: [1075, 2, "Thrileos"],
                70: [1514, 2, "Polatia"],
                71: [1515, 3, "Nesaios"],
                73: [1517, 1, "Leatoos"],
                74: [1518, 2, "Kiyios"],
                76: [1935, 3, "Etoutia"],
                77: [1936, 4, "Swotoios"],
                79: [1928, 4, "Taycios"],
                80: [1927, 3, "Trosteios"],
                81: [1924, 4, "Elmoos"],
                82: [1923, 3, "Sayooos"],
                84: [2420, 1, "Bitios"],
                85: [2421, 2, "Lertaos"],
                86: [2422, 3, "Nyautia"],
                87: [2423, 4, "Polutia"],
                89: [3134, 2, "Tuiraios"],
                90: [3135, 1, "Deleeos"],
                96: [3823, 3, "Phejios"],
                97: [3825, 1, "Sayoutia"],
                99: [4433, 4, "Ildios"],
                100: [4434, 1, "Zhihios"]
            },
            73: {
                1: [5131, 1, "Lleepoios"],
                2: [5132, 2, "Nihoios"],
                4: [4682, 4, "Moroos"],
                5: [4678, 2, "Zhoizios"],
                6: [4680, 4, "Phynios"],
                8: [4065, 3, "Wareitia"],
                9: [4063, 2, "Dafios"],
                11: [4061, 4, "Suilios"],
                12: [4060, 2, "Bureios"],
                14: [3395, 4, "Loinyios"],
                15: [3394, 2, "Loreatia"],
                17: [3376, 4, "Seytios"],
                18: [3374, 2, "Slyhios"],
                20: [2634, 1, "Aleios"],
                21: [2632, 3, "Slulios"],
                22: [2630, 1, "Gisios"],
                23: [2628, 3, "Umios"],
                24: [2626, 1, "Rothoios"],
                25: [2624, 3, "Acheitia"],
                27: [2072, 2, "Chonios"],
                28: [2070, 1, "Kinutia"],
                34: [1603, 1, "Unteios"],
                35: [1601, 3, "Awotia"],
                37: [1151, 2, "Loxeios"],
                38: [1152, 1, "Etouos"],
                40: [1135, 2, "Threnios"],
                41: [1133, 4, "Streeviios"],
                43: [1132, 1, "Shewios"],
                44: [1128, 3, "Troxios"],
                45: [1126, 1, "Swauluos"],
                46: [1124, 3, "Nauyios"],
                47: [1123, 1, "Dagios"],
                54: [779, 2, "Chreltuios"],
                55: [778, 4, "Birios"],
                60: [1087, 2, "Enthotia"],
                61: [1085, 4, "Samootia"],
                62: [1084, 3, "Ildetia"],
                64: [1076, 3, "Whonios"],
                65: [1077, 4, "Jotios"],
                66: [1079, 3, "Struvios"],
                67: [1081, 1, "Chebios"],
                69: [1522, 4, "Isotia"],
                70: [1521, 3, "Quytios"],
                76: [1937, 1, "Toriaos"],
                77: [1938, 2, "Trarduos"],
                79: [1929, 1, "Osaetia"],
                80: [1930, 2, "Schiecuios"],
                86: [2425, 2, "Kollios"],
                87: [2424, 1, "Oseos"],
                89: [3136, 4, "Nisios"],
                90: [3137, 3, "Liavios"],
                91: [3140, 4, "Savyios"],
                92: [3141, 3, "Lilios"],
                94: [3829, 1, "Onuitia"],
                95: [3827, 3, "Whohoos"],
                96: [3824, 4, "Baneos"],
                97: [3826, 2, "Umuios"],
                99: [4435, 2, "Jysios"],
                100: [4436, 3, "Bomios"]
            },
            74: {
                1: [5128, 4, "Veseuos"],
                2: [5129, 3, "Stuidiios"],
                4: [4683, 1, "Iriaos"],
                5: [4679, 3, "Snixios"],
                6: [4681, 1, "Blilios"],
                17: [3377, 1, "Retyos"],
                18: [3375, 3, "Slamios"],
                20: [2635, 2, "Atyos"],
                21: [2633, 4, "Sayoios"],
                27: [2073, 3, "Mobeos"],
                28: [2071, 2, "Deybyos"],
                30: [2056, 4, "Jeurios"],
                31: [2058, 1, "Trynios"],
                33: [1608, 2, "Schotoios"],
                34: [1606, 4, "Whehiios"],
                35: [1604, 2, "Kaduos"],
                40: [1136, 3, "Alditia"],
                41: [1134, 1, "Rilyos"],
                44: [1129, 2, "Angouos"],
                45: [1127, 4, "Snesuios"],
                46: [1125, 2, "Keahios"],
                47: [1121, 4, "Teiwuios"],
                48: [1119, 2, "Syneios"],
                50: [1117, 4, "Nyuios"],
                51: [1115, 2, "Laseios"],
                52: [1112, 3, "Zuqiios"],
                57: [1096, 1, "Niefiios"],
                58: [1095, 4, "Tirios"],
                61: [1089, 1, "Lihios"],
                62: [1090, 2, "Wotios"],
                65: [1078, 1, "Boedios"],
                66: [1080, 2, "Stiaruios"],
                67: [1082, 4, "Suleos"],
                69: [1524, 2, "Issotia"],
                70: [1523, 1, "Quaudios"],
                72: [1944, 3, "Roheos"],
                73: [1945, 4, "Tyrduos"],
                75: [1941, 1, "Rodayos"],
                76: [1939, 3, "Ingaios"],
                77: [1940, 4, "Sackeos"],
                79: [1931, 3, "Chreacoios"],
                80: [1932, 4, "Byndaios"],
                82: [2430, 2, "Naehios"],
                83: [2426, 3, "Rothatia"],
                84: [2427, 4, "Ildoeos"],
                90: [3138, 2, "Bleuyaos"],
                91: [3139, 1, "Poloos"],
                92: [3142, 2, "Erotia"],
                94: [3830, 2, "Wegoios"],
                95: [3828, 4, "Denitia"]
            },
            75: {
                1: [5127, 1, "Reunios"],
                2: [5130, 2, "Trannoos"],
                8: [4663, 3, "Oretia"],
                9: [4662, 2, "Moreetia"],
                10: [4661, 3, "Bleemios"],
                12: [4040, 1, "Jiarios"],
                13: [4038, 3, "Vesios"],
                15: [3385, 3, "Garaytia"],
                16: [3383, 1, "Diazios"],
                17: [3380, 2, "Nouriios"],
                18: [3378, 4, "Slisiios"],
                23: [2623, 4, "Curoos"],
                24: [2621, 2, "Augheatia"],
                25: [2619, 4, "Doopios"],
                30: [2055, 3, "Geidios"],
                31: [2053, 2, "Leruos"],
                33: [1609, 3, "Tranios"],
                34: [1607, 1, "Nomios"],
                35: [1605, 3, "Schatios"],
                37: [1594, 3, "Cateos"],
                38: [1593, 2, "Ruirios"],
                41: [1139, 2, "Bribeos"],
                42: [1137, 4, "Iaiatia"],
                47: [1122, 3, "Hadios"],
                48: [1120, 1, "Lloukiios"],
                50: [1118, 3, "Daidios"],
                51: [1114, 1, "Thrarios"],
                52: [1113, 4, "Dekyos"],
                53: [1110, 1, "Serutia"],
                54: [1108, 3, "Macios"],
                55: [1106, 1, "Tureetia"],
                57: [1097, 2, "Bresuios"],
                58: [1098, 3, "Stroodiios"],
                59: [1099, 2, "Samytia"],
                62: [1091, 4, "Tysoios"],
                63: [1092, 3, "Ranyios"],
                72: [1946, 1, "Coicyos"],
                73: [1947, 2, "Omaytia"],
                75: [1942, 2, "Bocoos"],
                76: [1943, 3, "Ightytia"],
                82: [2431, 4, "Lereos"],
                83: [2428, 1, "Strypoios"],
                84: [2429, 2, "Tiereos"],
                85: [2432, 1, "Aleetia"],
                87: [3144, 4, "Tylios"],
                88: [3143, 3, "Voevios"],
                97: [4449, 2, "Queetia"],
                98: [4450, 3, "Dokyios"]
            },
            76: {
                1: [5126, 3, "Thrareios"],
                2: [5122, 4, "Geunios"],
                3: [5121, 3, "Sleebios"],
                5: [5118, 4, "Zhatoios"],
                6: [5119, 2, "Soegios"],
                8: [4664, 1, "Staunios"],
                9: [4665, 4, "Noilios"],
                10: [4666, 1, "Gourryos"],
                12: [4041, 2, "Guzoos"],
                13: [4039, 4, "Aldaos"],
                15: [3384, 2, "Toleios"],
                16: [3382, 4, "Ackoos"],
                17: [3381, 3, "Snoizios"],
                18: [3379, 1, "Niajiios"],
                20: [3363, 2, "Streikios"],
                21: [3361, 4, "Swufoios"],
                23: [2622, 3, "Zhuikios"],
                24: [2620, 1, "Sysiios"],
                25: [2618, 3, "Caebiios"],
                26: [2617, 2, "Sulytia"],
                27: [2615, 4, "Quayos"],
                28: [2613, 2, "Kenios"],
                30: [2057, 4, "Lidaos"],
                31: [2054, 1, "Oldatia"],
                37: [1595, 1, "Rynutia"],
                38: [1591, 4, "Kychoios"],
                39: [1589, 3, "Chronoos"],
                41: [1140, 3, "Liteios"],
                42: [1138, 1, "Bofios"],
                44: [1578, 1, "Shyitia"],
                45: [1579, 2, "Layiios"],
                52: [1116, 3, "Rayyos"],
                53: [1111, 2, "Cossyios"],
                54: [1109, 4, "Drarios"],
                55: [1107, 2, "Imatia"],
                57: [1105, 1, "Quotoos"],
                58: [1101, 4, "Chrockaos"],
                59: [1100, 1, "Crolios"],
                60: [1102, 3, "Whuwuios"],
                62: [1094, 1, "Mosuos"],
                63: [1093, 2, "Swauxuos"],
                65: [1534, 1, "Etyos"],
                66: [1533, 4, "Nonoos"],
                68: [1529, 4, "Belaitia"],
                69: [1526, 2, "Delauos"],
                70: [1525, 4, "Ghaootia"],
                72: [1948, 3, "Catyios"],
                73: [1949, 4, "Loroos"],
                78: [2439, 2, "Crokaos"],
                79: [2436, 3, "Stretuos"],
                80: [2435, 2, "Nelios"],
                84: [2434, 3, "Kineos"],
                85: [2433, 4, "Shuxios"],
                87: [3146, 2, "Ackietia"],
                88: [3145, 1, "Ougheyos"],
                90: [3831, 1, "Onaitia"],
                91: [3833, 3, "Iaootia"],
                92: [3835, 1, "Tiewios"],
                93: [3837, 3, "Sayaeos"],
                94: [3839, 1, "Leadios"],
                95: [3841, 3, "Loenios"],
                97: [4451, 4, "Draoitia"],
                98: [4452, 1, "Enthoos"]
            },
            77: {
                1: [5125, 1, "Yauleios"],
                2: [5123, 2, "Schaywuios"],
                3: [5124, 1, "Homyios"],
                5: [5117, 3, "Jainoos"],
                6: [5120, 1, "Whafaios"],
                9: [4668, 2, "Smabaios"],
                10: [4667, 3, "Zholaios"],
                12: [4042, 3, "Geystiios"],
                13: [4044, 1, "Wheynios"],
                20: [3364, 3, "Warotia"],
                21: [3362, 1, "Viboios"],
                26: [2616, 1, "Snoxios"],
                27: [2614, 3, "Erietia"],
                28: [2612, 1, "Aughios"],
                30: [2059, 3, "Mailyos"],
                31: [2051, 4, "Chuchoios"],
                32: [2049, 1, "Clebios"],
                34: [2047, 2, "Zheitoos"],
                35: [2046, 4, "Crewios"],
                38: [1592, 2, "Nayteos"],
                39: [1590, 1, "Reebios"],
                44: [1581, 4, "Nusiios"],
                45: [1580, 3, "Kuchiios"],
                47: [1576, 2, "Throssaios"],
                48: [1574, 1, "Bonios"],
                49: [1572, 4, "Daehuos"],
                50: [1571, 3, "Athoios"],
                59: [1104, 2, "Tinaitia"],
                60: [1103, 4, "Hyzeios"],
                65: [1536, 3, "Nausios"],
                66: [1535, 2, "Schulyios"],
                68: [1530, 1, "Cyrroos"],
                69: [1527, 3, "Jacios"],
                70: [1528, 1, "Tewaos"],
                72: [1950, 1, "Llusios"],
                73: [1951, 2, "Swiexios"],
                74: [1952, 3, "Midios"],
                75: [1955, 2, "Phiasaios"],
                77: [2441, 3, "Swimoos"],
                78: [2440, 4, "Iaotia"],
                79: [2438, 1, "Engoos"],
                80: [2437, 4, "Whoihios"],
                81: [2446, 1, "Hosios"],
                82: [2447, 4, "Stujios"],
                87: [3148, 4, "Gosios"],
                88: [3147, 3, "Rigeos"],
                90: [3832, 2, "Chesuos"],
                91: [3834, 4, "Bruseos"],
                92: [3836, 2, "Slulaos"],
                93: [3838, 4, "Blolios"],
                94: [3840, 2, "Yelaos"],
                95: [3842, 4, "Rheseios"],
                97: [4453, 2, "Ashoos"],
                98: [4454, 3, "Moinniios"]
            },
            78: {
                5: [5116, 2, "Mabios"],
                6: [5114, 4, "Echaos"],
                7: [5112, 1, "Ranoetia"],
                12: [4043, 4, "Polytia"],
                13: [4045, 2, "Quaiyoios"],
                15: [4036, 3, "Shajios"],
                16: [4034, 1, "Brubiios"],
                17: [4028, 3, "Ereios"],
                18: [4026, 1, "Leumios"],
                20: [3367, 2, "Stiniios"],
                21: [3365, 4, "Laubios"],
                23: [3348, 2, "Smeusios"],
                24: [3347, 3, "Bloeseios"],
                31: [2052, 2, "Hatouos"],
                32: [2050, 3, "Quetios"],
                34: [2048, 1, "Yeroios"],
                35: [2044, 3, "Deleos"],
                36: [2043, 1, "Aughoitia"],
                39: [1598, 4, "Suindios"],
                40: [1596, 2, "Warytia"],
                42: [1588, 3, "Josios"],
                43: [1585, 4, "Lleuhuos"],
                44: [1582, 1, "Bloenios"],
                45: [1583, 2, "Zounnaos"],
                47: [1577, 4, "Angoios"],
                48: [1575, 3, "Emaitia"],
                49: [1573, 2, "Samoos"],
                50: [1569, 1, "Rakootia"],
                51: [1567, 3, "Stehios"],
                53: [1565, 1, "Keletia"],
                54: [1563, 2, "Maubios"],
                56: [1556, 3, "Iratia"],
                57: [1555, 2, "Tidiios"],
                62: [1544, 2, "Cawyios"],
                63: [1543, 3, "Usteetia"],
                64: [1538, 4, "Rerios"],
                65: [1537, 1, "Takios"],
                66: [1541, 4, "Toneatia"],
                68: [1531, 2, "Liarios"],
                69: [1532, 4, "Dredaios"],
                74: [1953, 4, "Tyrios"],
                75: [1954, 1, "Keachuos"],
                77: [2442, 1, "Kecios"],
                78: [2443, 2, "Ashoetia"],
                80: [2444, 3, "Sterios"],
                81: [2445, 2, "Suleeos"],
                82: [2448, 3, "Pefios"],
                84: [3152, 3, "Mivaos"],
                85: [3151, 2, "Cremios"],
                87: [3150, 2, "Uskeeos"],
                88: [3149, 1, "Finios"],
                97: [4455, 4, "Pethyos"],
                98: [4456, 1, "Smonuos"]
            },
            79: {
                2: [5398, 3, "Hunios"],
                3: [5399, 2, "Iaeos"],
                5: [5115, 1, "Derdyos"],
                6: [5113, 3, "Dazios"],
                7: [5111, 2, "Iaauos"],
                9: [5100, 3, "Thoirios"],
                10: [5099, 2, "Vereytia"],
                15: [4037, 4, "Doeluos"],
                16: [4035, 2, "Whiwios"],
                17: [4029, 4, "Snusteios"],
                18: [4027, 2, "Nuitaios"],
                20: [3368, 3, "Ryrios"],
                21: [3366, 1, "Kodios"],
                23: [3349, 1, "Brobios"],
                24: [3346, 4, "Liexios"],
                25: [3344, 2, "Risitia"],
                26: [3342, 4, "Essotia"],
                28: [2609, 3, "Wodyios"],
                29: [2608, 2, "Athios"],
                35: [2045, 2, "Hinuitia"],
                36: [2042, 4, "Tinitia"],
                37: [2041, 3, "Coelios"],
                39: [1599, 3, "Reineos"],
                40: [1597, 1, "Treixuios"],
                42: [1587, 1, "Threkios"],
                43: [1586, 2, "Untyos"],
                44: [1584, 3, "Seyckoos"],
                50: [1570, 2, "Risoetia"],
                51: [1568, 4, "Zhafyos"],
                53: [1566, 4, "Feykeos"],
                54: [1564, 3, "Ormeos"],
                55: [1561, 1, "Renios"],
                56: [1558, 4, "Neeniios"],
                57: [1557, 1, "Strokaos"],
                59: [1549, 3, "Aleuos"],
                60: [1547, 1, "Swockoios"],
                62: [1545, 4, "Sackyos"],
                63: [1546, 1, "Peroeos"],
                64: [1539, 2, "Newoos"],
                65: [1540, 3, "Smakios"],
                66: [1542, 2, "Untutia"],
                71: [1956, 1, "Beurios"],
                72: [1957, 2, "Foephios"],
                84: [3154, 1, "Aleaos"],
                85: [3153, 4, "Palios"],
                90: [3843, 1, "Timios"],
                91: [3845, 2, "Zhefoios"],
                93: [4437, 4, "Wopios"],
                94: [4439, 2, "Thrikios"],
                96: [4458, 3, "Gonios"],
                97: [4457, 2, "Taleos"]
            },
            80: {
                2: [5397, 1, "Zeyraos"],
                3: [5396, 4, "Voraios"],
                9: [5102, 1, "Naubiios"],
                10: [5101, 4, "Whaykaios"],
                12: [4658, 4, "Seiruios"],
                13: [4657, 2, "Nykios"],
                16: [4032, 3, "Daroios"],
                17: [4030, 1, "Nidios"],
                20: [3369, 4, "Neceios"],
                25: [3345, 1, "Undeyos"],
                26: [3343, 3, "Turdyos"],
                28: [2610, 1, "Achoeos"],
                29: [2605, 4, "Shyuitia"],
                30: [2604, 2, "Kyhios"],
                32: [2601, 4, "Rurios"],
                33: [2600, 3, "Ashyos"],
                36: [2039, 1, "Laurios"],
                37: [2038, 2, "Enuos"],
                46: [2016, 1, "Voratia"],
                47: [2014, 2, "Quilyos"],
                48: [2012, 1, "Poleaos"],
                55: [1562, 2, "Vayruios"],
                56: [1560, 3, "Ranaos"],
                57: [1559, 2, "Aryos"],
                59: [1550, 4, "Polotia"],
                60: [1548, 2, "Swaydoos"],
                68: [1964, 4, "Woriatia"],
                69: [1960, 1, "Gophaios"],
                70: [1961, 2, "Kesios"],
                71: [1958, 3, "Nileios"],
                72: [1959, 4, "Nintyos"],
                74: [2483, 3, "Nobios"],
                75: [2484, 2, "Whoyios"],
                77: [3176, 4, "Riloutia"],
                78: [3178, 2, "Zaitios"],
                79: [3180, 4, "Ranoitia"],
                81: [3168, 2, "Denoetia"],
                82: [3167, 1, "Strookoos"],
                84: [3156, 2, "Awuios"],
                85: [3155, 3, "Yealios"],
                86: [3159, 1, "Struluios"],
                87: [3160, 3, "Rhoneos"],
                89: [3847, 1, "Laltoios"],
                90: [3844, 3, "Eratia"],
                91: [3846, 4, "Atuos"],
                93: [4438, 1, "Trebeos"],
                94: [4440, 3, "Thresios"],
                96: [4460, 1, "Ineoios"],
                97: [4459, 4, "Itautia"],
                99: [4461, 1, "Esseutia"],
                100: [4462, 2, "Aldeios"]
            },
            81: {
                3: [5395, 2, "Ardyos"],
                4: [5393, 1, "Oreetia"],
                5: [5391, 2, "Chroideos"],
                7: [5110, 1, "Ceetuos"],
                8: [5108, 4, "Disoos"],
                9: [5104, 3, "Droerios"],
                10: [5103, 2, "Vurios"],
                12: [4659, 1, "Jaysios"],
                13: [4650, 3, "Statios"],
                14: [4649, 2, "Tanaos"],
                16: [4033, 4, "Tytaos"],
                17: [4031, 2, "Ashaitia"],
                19: [3371, 2, "Clanuios"],
                20: [3370, 1, "Cytoos"],
                22: [3358, 3, "Naerios"],
                23: [3357, 2, "Meusios"],
                28: [2611, 2, "Daraos"],
                29: [2607, 3, "Pephyios"],
                30: [2606, 1, "Tinaios"],
                32: [2602, 1, "Royuos"],
                33: [2599, 2, "Siloios"],
                34: [2598, 1, "Sitoos"],
                36: [2040, 3, "Ghauos"],
                37: [2036, 4, "Swardeios"],
                38: [2034, 2, "Taiotia"],
                40: [2032, 4, "Strialeos"],
                41: [2030, 2, "Dreimios"],
                42: [2028, 4, "Toolloios"],
                43: [2022, 2, "Snoduos"],
                44: [2020, 4, "Cosios"],
                46: [2017, 3, "Whaerroos"],
                47: [2015, 4, "Hinotia"],
                48: [2013, 3, "Sotoos"],
                49: [2009, 1, "Swokoos"],
                50: [2007, 3, "Samaeos"],
                52: [2000, 4, "Rynoetia"],
                53: [1999, 3, "Haytios"],
                59: [1551, 1, "Loixuios"],
                60: [1553, 3, "Ackeytia"],
                62: [1980, 3, "Sloroios"],
                63: [1979, 2, "Pikiios"],
                65: [1968, 1, "Straidios"],
                66: [1969, 3, "Uskeuos"],
                68: [1965, 2, "Stipios"],
                69: [1962, 3, "Slarios"],
                70: [1963, 4, "Carios"],
                74: [2482, 1, "Vewyos"],
                75: [2485, 4, "Necaios"],
                77: [3177, 1, "Tholios"],
                78: [3179, 3, "Poleutia"],
                79: [3181, 1, "Trasios"],
                81: [3170, 4, "Blasios"],
                82: [3169, 3, "Tachuos"],
                84: [3158, 1, "Thaudios"],
                85: [3157, 4, "Nouryios"],
                86: [3161, 2, "Whicaos"],
                87: [3162, 4, "Snyghaos"],
                89: [3848, 4, "Striamoos"],
                90: [3849, 2, "Cerotia"],
                91: [3850, 1, "Cruhios"],
                93: [4441, 4, "Lydaos"],
                94: [4443, 2, "Breetiios"],
                99: [4463, 3, "Smynios"],
                100: [4464, 4, "Hoesios"]
            },
            82: {
                4: [5394, 3, "Rucios"],
                5: [5392, 4, "Eldeytia"],
                7: [5109, 3, "Cerietia"],
                8: [5107, 2, "Cheeatia"],
                9: [5106, 1, "Quaootia"],
                10: [5105, 4, "Foicuios"],
                12: [4660, 2, "Ackios"],
                13: [4652, 4, "Yeybios"],
                14: [4651, 1, "Ormiaos"],
                19: [3372, 3, "Zhymios"],
                20: [3373, 4, "Asaetia"],
                22: [3359, 4, "Meymios"],
                23: [3356, 1, "Lutoios"],
                24: [3354, 3, "Etieos"],
                25: [3352, 1, "Stoumeos"],
                26: [3350, 3, "Sayuos"],
                33: [2596, 3, "Peritia"],
                34: [2595, 4, "Chaeuos"],
                37: [2037, 3, "Tutios"],
                38: [2035, 1, "Blostuios"],
                40: [2033, 1, "Smointoios"],
                41: [2031, 3, "Anaos"],
                42: [2029, 1, "Skeloos"],
                43: [2023, 3, "Fuyyos"],
                44: [2021, 1, "Cedios"],
                46: [2018, 1, "Nysotia"],
                47: [2019, 2, "Draytia"],
                49: [2010, 2, "Cheoutia"],
                50: [2008, 4, "Itooos"],
                52: [2002, 2, "Kimoetia"],
                53: [2001, 1, "Vortiios"],
                54: [2003, 2, "Yiveios"],
                56: [1989, 1, "Emitia"],
                57: [1987, 3, "Luluos"],
                59: [1552, 2, "Kaliatia"],
                60: [1554, 4, "Radeutia"],
                62: [1982, 1, "Ryhuios"],
                63: [1981, 4, "Siarios"],
                65: [1970, 4, "Tehyios"],
                66: [1971, 2, "Rahios"],
                68: [1966, 1, "Enthaos"],
                69: [1967, 4, "Thereaos"],
                72: [2461, 1, "Nanios"],
                73: [2458, 3, "Gegios"],
                74: [2481, 2, "Iaeios"],
                79: [3182, 2, "Tonuos"],
                82: [3171, 1, "Kaucoios"],
                93: [4442, 1, "Sykios"],
                94: [4444, 3, "Heisios"],
                96: [4472, 4, "Queeutia"],
                97: [4471, 3, "Taykios"],
                98: [4466, 2, "Eldoutia"],
                99: [4465, 1, "Dunyos"],
                100: [4474, 2, "Binnoos"]
            },
            83: {
                13: [4654, 3, "Tanietia"],
                14: [4653, 2, "Noosaos"],
                16: [4648, 1, "Kairios"],
                17: [4647, 3, "Brockeios"],
                23: [3360, 2, "Emaios"],
                24: [3355, 4, "Ciefios"],
                25: [3353, 2, "Mehuos"],
                26: [3351, 4, "Sepaos"],
                28: [3339, 2, "Tageos"],
                29: [3338, 1, "Lirios"],
                30: [3333, 4, "Heduios"],
                31: [3332, 3, "Echeatia"],
                33: [2597, 2, "Swicoios"],
                34: [2593, 1, "Dilios"],
                35: [2591, 2, "Endytia"],
                52: [2006, 4, "Dylios"],
                53: [2005, 3, "Benuos"],
                54: [2004, 4, "Enthios"],
                56: [1990, 2, "Quookios"],
                57: [1988, 4, "Radaeos"],
                62: [1984, 3, "Rakeeos"],
                63: [1983, 2, "Teatios"],
                65: [1972, 1, "Honitia"],
                66: [1973, 3, "Deniaos"],
                71: [2465, 1, "Donios"],
                72: [2462, 2, "Athietia"],
                73: [2460, 4, "Watios"],
                76: [2486, 1, "Sytuios"],
                77: [2488, 2, "Anatia"],
                79: [3183, 3, "Lereytia"],
                80: [3184, 4, "Niazios"],
                82: [3172, 2, "Chaeos"],
                83: [3173, 3, "Tesios"],
                85: [3851, 4, "Kalutia"],
                86: [3853, 2, "Phaylios"],
                88: [4479, 3, "Inaaytia"],
                89: [4477, 4, "Susios"],
                90: [4475, 2, "Dareeos"],
                92: [4446, 1, "Emauos"],
                93: [4445, 4, "Honios"],
                94: [4473, 2, "Sopiios"],
                96: [4470, 2, "Tatios"],
                97: [4469, 1, "Shurios"],
                98: [4468, 4, "Feajios"],
                99: [4467, 3, "Bresoos"]
            },
            84: {
                4: [5408, 2, "Eldaitia"],
                5: [5407, 1, "Schonios"],
                6: [5404, 2, "Rihiios"],
                7: [5402, 4, "Drurios"],
                8: [5400, 3, "Sliruios"],
                10: [5384, 4, "Lejios"],
                11: [5383, 2, "Tanitia"],
                13: [4656, 4, "Yeretia"],
                14: [4655, 1, "Adoutia"],
                16: [4643, 4, "Moulios"],
                17: [4641, 2, "Stahaios"],
                18: [4639, 4, "Stywoios"],
                20: [4020, 4, "Rynaos"],
                21: [4019, 3, "Rayutia"],
                28: [3341, 4, "Untytia"],
                29: [3340, 3, "Dewios"],
                30: [3335, 2, "Bliefios"],
                31: [3334, 1, "Smesios"],
                33: [2603, 3, "Kinios"],
                34: [2594, 4, "Theretia"],
                35: [2592, 3, "Heyaos"],
                37: [2583, 2, "Kipaos"],
                38: [2580, 3, "Kaleos"],
                39: [2579, 4, "Kaqyos"],
                41: [2567, 3, "Swildoios"],
                42: [2566, 2, "Lyryios"],
                44: [2559, 2, "Zhaldyos"],
                45: [2558, 1, "Ladios"],
                46: [2555, 2, "Shunnaos"],
                47: [2554, 1, "Mudaios"],
                49: [2553, 4, "Cizios"],
                50: [2552, 3, "Atitia"],
                57: [1992, 3, "Dreloios"],
                58: [1991, 1, "Leraos"],
                59: [1996, 3, "Hichoios"],
                60: [1995, 1, "Rynaetia"],
                62: [1986, 1, "Huroos"],
                63: [1985, 4, "Belitia"],
                65: [1974, 4, "Dakoos"],
                66: [1975, 2, "Tremaios"],
                67: [1978, 4, "Sninios"],
                69: [2469, 1, "Uskitia"],
                70: [2466, 3, "Aughetia"],
                71: [2464, 4, "Quirios"],
                75: [2490, 4, "Domaios"],
                76: [2487, 3, "Rayoetia"],
                77: [2489, 4, "Niloios"],
                79: [3186, 2, "Luyios"],
                80: [3185, 1, "Aneetia"],
                82: [3175, 1, "Deteios"],
                83: [3174, 4, "Fyphyios"],
                85: [3852, 1, "Untoetia"],
                86: [3854, 3, "Athotia"],
                88: [4480, 2, "Dabuios"],
                89: [4478, 1, "Kelaitia"],
                90: [4476, 3, "Oruos"],
                92: [4448, 3, "Delios"],
                93: [4447, 2, "Tramios"]
            },
            85: {
                4: [5409, 3, "Clinios"],
                5: [5406, 4, "Irios"],
                6: [5405, 3, "Biseios"],
                7: [5403, 1, "Rhenios"],
                8: [5401, 2, "Toibios"],
                10: [5386, 3, "Irutia"],
                11: [5385, 1, "Snowios"],
                16: [4644, 1, "Holios"],
                17: [4642, 3, "Brabios"],
                18: [4640, 1, "Jideios"],
                20: [4021, 1, "Taseaos"],
                21: [4018, 2, "Shuchuios"],
                22: [4017, 1, "Shyeutia"],
                23: [4014, 2, "Gotios"],
                25: [3997, 3, "Wareuos"],
                26: [3996, 2, "Snolios"],
                30: [3337, 4, "Ramyios"],
                31: [3336, 3, "Blabios"],
                37: [2584, 4, "Waretia"],
                38: [2582, 1, "Tonaetia"],
                39: [2581, 2, "Stutios"],
                41: [2569, 1, "Whybios"],
                42: [2568, 4, "Sleypios"],
                44: [2561, 4, "Yeybeos"],
                45: [2560, 3, "Vorytia"],
                46: [2557, 4, "Lloosios"],
                47: [2556, 3, "Yakios"],
                49: [2551, 2, "Swistios"],
                50: [2550, 1, "Boelios"],
                51: [2547, 2, "Strosios"],
                52: [2546, 1, "Womiios"],
                54: [2545, 2, "Noophaos"],
                55: [2543, 4, "Quaaeos"],
                57: [1994, 2, "Shianios"],
                58: [1993, 4, "Sathiios"],
                59: [1998, 2, "Ranotia"],
                60: [1997, 4, "Tapios"],
                66: [1976, 1, "Quaylios"],
                67: [1977, 3, "Chroweios"],
                69: [2470, 4, "Adoetia"],
                70: [2467, 2, "Taqoos"],
                71: [2468, 1, "Rukaios"],
                73: [2494, 4, "Dyneatia"],
                74: [2493, 3, "Schorios"],
                75: [2491, 1, "Rothios"],
                76: [2492, 2, "Yikios"],
                77: [2497, 1, "Loudoios"],
                85: [3855, 4, "Drerdoos"],
                86: [3857, 2, "Dyqeios"],
                88: [4481, 4, "Hotoos"],
                89: [4482, 2, "Teifios"],
                95: [4983, 1, "Chriayios"],
                96: [4984, 3, "Skelouos"],
                97: [4986, 4, "Oughaos"]
            },
            86: {
                3: [5411, 1, "Bekyos"],
                4: [5410, 2, "Fesios"],
                10: [5388, 4, "Ashetia"],
                11: [5387, 2, "Rothotia"],
                13: [5097, 4, "Ineatia"],
                14: [5096, 3, "Levios"],
                16: [4645, 2, "Aldaeos"],
                17: [4646, 4, "Droelteos"],
                22: [4016, 4, "Stemios"],
                23: [4015, 3, "Nyseitia"],
                25: [3998, 4, "Suimyos"],
                26: [3995, 1, "Taneitia"],
                27: [3993, 3, "Ineyos"],
                28: [3992, 2, "Lliexaos"],
                33: [3325, 2, "Atheutia"],
                34: [3323, 4, "Reexios"],
                36: [2586, 1, "Phosoios"],
                37: [2585, 2, "Aleutia"],
                41: [2571, 3, "Scheufaos"],
                42: [2570, 2, "Dusios"],
                44: [2563, 2, "Ashitia"],
                45: [2562, 1, "Engitia"],
                51: [2549, 4, "Weduios"],
                52: [2548, 3, "Bluinaios"],
                54: [2544, 3, "Ildaetia"],
                55: [2542, 1, "Danetia"],
                62: [2518, 2, "Aleaetia"],
                63: [2517, 4, "Queryos"],
                64: [2515, 2, "Zastuios"],
                73: [2495, 1, "Phetios"],
                74: [2496, 2, "Wytios"],
                79: [3188, 4, "Hydios"],
                80: [3189, 3, "Riasyios"],
                81: [3192, 2, "Lordyos"],
                82: [3193, 3, "Taneos"],
                84: [3859, 4, "Nyootia"],
                85: [3856, 1, "Sayotia"],
                86: [3858, 3, "Vutios"],
                88: [4484, 1, "Enthitia"],
                89: [4483, 3, "Honeos"],
                91: [4968, 4, "Sowoos"],
                92: [4969, 1, "Araeos"],
                94: [4979, 1, "Adoos"],
                95: [4981, 4, "Citeios"],
                96: [4985, 2, "Haykios"],
                97: [4987, 1, "Ildieos"]
            },
            87: {
                3: [5412, 4, "Leruios"],
                4: [5413, 3, "Ightuios"],
                6: [5418, 2, "Rakouos"],
                7: [5415, 3, "Cisyios"],
                8: [5414, 4, "Arduos"],
                10: [5390, 1, "Lloroos"],
                11: [5389, 3, "Ranitia"],
                13: [5098, 1, "Achios"],
                14: [5095, 2, "Bywios"],
                19: [4632, 2, "Undotia"],
                20: [4631, 3, "Therotia"],
                22: [4024, 2, "Roryos"],
                23: [4022, 1, "Chauos"],
                28: [3991, 1, "Eldieos"],
                29: [3987, 4, "Kaleetia"],
                30: [3985, 2, "Essoeos"],
                31: [3983, 4, "Kediios"],
                33: [3326, 3, "Shelios"],
                34: [3324, 1, "Soryos"],
                36: [2588, 4, "Wherios"],
                37: [2587, 3, "Visios"],
                39: [2575, 3, "Vuvios"],
                40: [2574, 2, "Tureutia"],
                41: [2573, 1, "Throtaios"],
                42: [2572, 4, "Loreaos"],
                44: [2565, 4, "Elduios"],
                45: [2564, 3, "Angoutia"],
                47: [3286, 1, "Lyeoos"],
                48: [3283, 3, "Shaekios"],
                49: [3282, 1, "Chaexios"],
                54: [2540, 4, "Rayiatia"],
                55: [2538, 2, "Yifios"],
                56: [2536, 4, "Latoios"],
                57: [2534, 2, "Echeeos"],
                59: [2522, 3, "Marios"],
                60: [2521, 2, "Neycuios"],
                62: [2520, 3, "Pasuios"],
                63: [2519, 1, "Hatotia"],
                64: [2516, 3, "Rynauos"],
                65: [2511, 2, "Thieyios"],
                66: [2510, 4, "Eldouos"],
                67: [2507, 3, "Atetia"],
                68: [2506, 4, "Rovios"],
                70: [2499, 4, "Denetia"],
                71: [2498, 3, "Naleos"],
                76: [3197, 3, "Zholoos"],
                77: [3196, 2, "Shyios"],
                79: [3190, 2, "Shautios"],
                80: [3191, 1, "Lazios"],
                81: [3194, 4, "Etaetia"],
                82: [3195, 1, "Choedios"],
                84: [3860, 3, "Turetia"],
                85: [3861, 2, "Tegios"],
                91: [4970, 3, "Tirrios"],
                92: [4971, 2, "Sereyos"],
                94: [4980, 2, "Chraestios"],
                95: [4982, 3, "Nyseeos"]
            },
            88: {
                6: [5419, 4, "Taiauos"],
                7: [5417, 1, "Theroios"],
                8: [5416, 2, "Etaos"],
                14: [5093, 4, "Nebuos"],
                15: [5091, 2, "Ildoios"],
                16: [5089, 4, "Nareos"],
                17: [5087, 2, "Cranoos"],
                19: [4634, 4, "Uskoos"],
                20: [4633, 1, "Samitia"],
                22: [4025, 3, "Gysuos"],
                23: [4023, 4, "Sulaos"],
                25: [4000, 3, "Ireuos"],
                26: [3999, 2, "Llilliios"],
                29: [3988, 1, "Strenuos"],
                30: [3986, 3, "Yutoios"],
                31: [3984, 1, "Eteuos"],
                33: [3329, 2, "Slylyos"],
                34: [3327, 4, "Rhirios"],
                36: [2590, 1, "Venoos"],
                37: [2589, 2, "Radotia"],
                39: [2577, 1, "Tujuos"],
                40: [2576, 4, "Losios"],
                41: [2578, 3, "Drabuos"],
                47: [3287, 2, "Yorios"],
                48: [3285, 4, "Keywios"],
                49: [3284, 2, "Kissaios"],
                51: [3271, 1, "Snyhios"],
                52: [3270, 4, "Labios"],
                54: [2541, 1, "Isautia"],
                55: [2539, 3, "Kaceos"],
                56: [2537, 1, "Rhiatheos"],
                57: [2535, 3, "Chehios"],
                59: [2524, 1, "Tharios"],
                60: [2523, 4, "Taphoios"],
                66: [2512, 1, "Ledeios"],
                67: [2509, 2, "Etooos"],
                68: [2508, 1, "Schuirios"],
                70: [2501, 2, "Realtyios"],
                71: [2500, 1, "Moruos"],
                73: [3211, 2, "Liebios"],
                74: [3210, 1, "Rehuos"],
                76: [3198, 4, "Achootia"],
                77: [3199, 1, "Anguios"],
                87: [4491, 3, "Vayloos"],
                88: [4493, 1, "Maupyios"],
                90: [4973, 1, "Lidios"],
                91: [4972, 4, "Chrehyios"],
                97: [5047, 3, "Hatuos"],
                98: [5049, 2, "Reutios"]
            },
            89: {
                2: [5608, 2, "Ardatia"],
                3: [5607, 1, "Sneereios"],
                5: [5425, 3, "Essatia"],
                6: [5424, 2, "Llinyios"],
                8: [5420, 4, "Tauneos"],
                9: [5421, 3, "Zydios"],
                11: [5381, 1, "Omouos"],
                12: [5382, 2, "Nileos"],
                14: [5094, 1, "Deekaos"],
                15: [5092, 3, "Deheos"],
                16: [5090, 1, "Reyghyios"],
                17: [5088, 3, "Zoltaios"],
                19: [4636, 3, "Swuyuos"],
                20: [4635, 2, "Comaios"],
                25: [4002, 1, "Elmaos"],
                26: [4001, 4, "Engaetia"],
                27: [4005, 1, "Sizios"],
                30: [3990, 4, "Bloifios"],
                31: [3989, 2, "Orotia"],
                33: [3330, 3, "Chradios"],
                34: [3328, 1, "Aroetia"],
                43: [3301, 4, "Clejios"],
                44: [3299, 2, "Zhajios"],
                45: [3298, 1, "Creenios"],
                48: [3289, 1, "Danytia"],
                49: [3288, 3, "Inaoios"],
                51: [3273, 3, "Roemios"],
                52: [3272, 2, "Rydoos"],
                59: [2526, 3, "Doegoios"],
                60: [2525, 2, "Peurdoios"],
                61: [2527, 4, "Ziaghuios"],
                63: [3234, 2, "Sauloios"],
                64: [3233, 3, "Zhilios"],
                70: [2503, 4, "Pereuos"],
                71: [2502, 3, "Lyeyos"],
                73: [3213, 4, "Taneatia"],
                74: [3212, 3, "Skelauos"],
                76: [3201, 3, "Ramyos"],
                77: [3200, 2, "Phuikaos"],
                78: [3204, 4, "Clandoios"],
                79: [3206, 1, "Quyrios"],
                81: [3863, 2, "Shoosios"],
                82: [3864, 3, "Winios"],
                84: [4485, 1, "Oughutia"],
                85: [4487, 3, "Shaenaios"],
                86: [4489, 1, "Ghaayos"],
                87: [4492, 4, "Dronaos"],
                88: [4494, 2, "Ateios"],
                90: [4975, 2, "Kinaos"],
                91: [4974, 3, "Honeuos"],
                92: [4978, 2, "Deexaios"],
                94: [5009, 4, "Biecios"],
                95: [5010, 1, "Chasoios"],
                97: [5048, 4, "Aldoos"],
                98: [5050, 1, "Lihaos"]
            },
            90: {
                2: [5606, 4, "Keleitia"],
                3: [5605, 3, "Eldytia"],
                5: [5426, 4, "Perytia"],
                6: [5427, 1, "Peruos"],
                8: [5423, 1, "Wheukoios"],
                9: [5422, 2, "Bracheios"],
                11: [5379, 4, "Queeatia"],
                12: [5378, 3, "Wharios"],
                19: [4638, 1, "Tootios"],
                20: [4637, 4, "Awatia"],
                22: [4622, 2, "Vawios"],
                23: [4621, 3, "Lorietia"],
                26: [4003, 2, "Celluos"],
                27: [4004, 3, "Nalatia"],
                28: [4006, 2, "Mosetia"],
                36: [3318, 1, "Napyios"],
                37: [3315, 3, "Thrudoios"],
                38: [3314, 1, "Isuitia"],
                40: [3306, 1, "Lovios"],
                41: [3305, 4, "Whyhios"],
                43: [3302, 1, "Zaindaios"],
                44: [3300, 3, "Pelios"],
                45: [3296, 4, "Peroutia"],
                46: [3295, 2, "Fysaos"],
                51: [3275, 1, "Yusios"],
                52: [3274, 4, "Direos"],
                54: [3264, 1, "Hisyos"],
                55: [3262, 3, "Cheaos"],
                56: [3260, 1, "Lyeytia"],
                58: [2531, 3, "Queeitia"],
                59: [2530, 4, "Pasios"],
                60: [2529, 1, "Ranuios"],
                61: [2528, 3, "Tronios"],
                63: [3236, 1, "Riliios"],
                64: [3235, 4, "Lemaios"],
                65: [3237, 1, "Nasoios"],
                67: [3231, 2, "Buroos"],
                68: [3232, 1, "Zhenios"],
                70: [2505, 2, "Hateetia"],
                71: [2504, 1, "Breyrios"],
                73: [3215, 2, "Enoeos"],
                74: [3214, 1, "Llasaios"],
                76: [3202, 4, "Mideos"],
                77: [3203, 1, "Swaecios"],
                78: [3205, 3, "Seuleios"],
                79: [3207, 2, "Nalouos"],
                81: [3862, 1, "Lalaios"],
                82: [3865, 4, "Reqaos"],
                84: [4486, 2, "Boivyos"],
                85: [4488, 4, "Vesuitia"],
                86: [4490, 2, "Siaxios"],
                91: [4976, 1, "Zhykios"],
                92: [4977, 4, "Smivios"],
                94: [5008, 3, "Oldaos"],
                95: [5011, 2, "Ightaeos"],
                98: [5051, 2, "Iteos"],
                99: [5052, 3, "Pabeos"]
            },
            91: {
                1: [5611, 1, "Shyuos"],
                2: [5604, 2, "Unteetia"],
                3: [5603, 1, "Losiios"],
                11: [5380, 1, "Estetia"],
                12: [5377, 2, "Saellaios"],
                13: [5375, 4, "Cydios"],
                14: [5373, 2, "Polaios"],
                16: [5363, 2, "Blofios"],
                17: [5362, 1, "Blouvios"],
                22: [4623, 1, "Chrurtios"],
                23: [4620, 4, "Kayduios"],
                24: [4619, 1, "Emietia"],
                27: [4008, 4, "Garoos"],
                28: [4007, 1, "Relios"],
                29: [4011, 4, "Nyeios"],
                30: [4012, 3, "Seryos"],
                32: [3974, 4, "Jelios"],
                33: [3972, 2, "Dedios"],
                35: [3320, 3, "Tradios"],
                36: [3319, 2, "Duirdiios"],
                37: [3317, 4, "Kelaios"],
                38: [3316, 2, "Geunuios"],
                40: [3308, 3, "Lladaos"],
                41: [3307, 2, "Lloebios"],
                45: [3297, 3, "Enthaeos"],
                46: [3294, 1, "Herios"],
                47: [3291, 4, "Cakoos"],
                48: [3290, 1, "Topios"],
                50: [3278, 4, "Ryneitia"],
                51: [3277, 3, "Ardoios"],
                52: [3276, 2, "Dynytia"],
                54: [3265, 2, "Naleios"],
                55: [3263, 4, "Geedios"],
                56: [3261, 2, "Ingoos"],
                58: [2532, 1, "Maidios"],
                59: [2533, 2, "Worayos"],
                64: [3239, 3, "Nikios"],
                65: [3238, 2, "Unditia"],
                67: [3230, 4, "Reileos"],
                68: [3229, 3, "Serouos"],
                73: [3216, 3, "Sleyyoos"],
                78: [3209, 1, "Neidaos"],
                79: [3208, 4, "Straefios"],
                81: [3866, 3, "Cealios"],
                82: [3867, 2, "Worietia"],
                88: [4500, 1, "Lakeios"],
                89: [4502, 2, "Stiarios"],
                95: [5016, 3, "Undoos"],
                96: [5017, 4, "Osauos"],
                98: [5054, 1, "Shesuos"],
                99: [5053, 4, "Deneatia"]
            },
            92: {
                1: [5610, 4, "Denaeos"],
                2: [5609, 3, "Neejios"],
                5: [5596, 2, "Zimoios"],
                6: [5594, 4, "Lialloos"],
                8: [5569, 3, "Seyrios"],
                9: [5568, 2, "Voukios"],
                13: [5376, 1, "Lipios"],
                14: [5374, 3, "Lloodios"],
                16: [5365, 4, "Skeleeos"],
                17: [5364, 3, "Mandoos"],
                19: [5084, 1, "Imitia"],
                20: [5085, 4, "Turaos"],
                22: [4630, 2, "Snimyos"],
                23: [4624, 3, "Narios"],
                24: [4618, 2, "Clytios"],
                25: [4617, 3, "Quelios"],
                28: [4009, 3, "Thranios"],
                29: [4010, 2, "Iseitia"],
                30: [4013, 1, "Kimeatia"],
                32: [3975, 1, "Echatia"],
                33: [3973, 3, "Aseios"],
                35: [3321, 4, "Maystiios"],
                36: [3322, 1, "Dreekios"],
                41: [3309, 4, "Hegios"],
                42: [3310, 1, "Onios"],
                43: [3311, 2, "Aritia"],
                45: [3304, 4, "Ceyaos"],
                46: [3303, 2, "Gumuios"],
                47: [3293, 3, "Boenios"],
                48: [3292, 2, "Lakios"],
                50: [3279, 2, "Dysios"],
                51: [3280, 1, "Supios"],
                52: [3281, 4, "Snockios"],
                54: [3267, 1, "Asoitia"],
                55: [3266, 3, "Ustaos"],
                61: [3249, 1, "Nysatia"],
                62: [3248, 4, "Teamios"],
                64: [3247, 1, "Rhonios"],
                65: [3246, 4, "Slezios"],
                67: [3226, 2, "Bicios"],
                68: [3225, 1, "Llukios"],
                69: [3222, 2, "Traevaos"],
                70: [3221, 1, "Skeleos"],
                72: [3218, 1, "Piecaios"],
                73: [3217, 4, "Zhisios"],
                75: [3885, 1, "Schaebuios"],
                76: [3884, 4, "Dotios"],
                81: [3868, 1, "Nutios"],
                82: [3869, 4, "Nyseyos"],
                83: [3873, 1, "Smooneos"],
                84: [3875, 2, "Traisios"],
                86: [4495, 4, "Dyneytia"],
                87: [4497, 3, "Ardautia"],
                88: [4499, 4, "Rilios"],
                89: [4501, 3, "Smugiios"],
                90: [4503, 4, "Lyeuitia"],
                92: [4996, 1, "Phayniios"],
                93: [4997, 2, "Atheos"],
                95: [5022, 1, "Meroios"],
                96: [5023, 2, "Poulios"],
                98: [5057, 3, "Yybiios"],
                99: [5055, 2, "Roojios"]
            },
            93: {
                1: [5613, 3, "Rurdaios"],
                2: [5612, 2, "Noweios"],
                4: [5598, 4, "Chaeatia"],
                5: [5597, 3, "Therautia"],
                6: [5595, 1, "Mohios"],
                8: [5570, 4, "Beloos"],
                9: [5567, 1, "Beunios"],
                10: [5566, 4, "Raleios"],
                11: [5564, 2, "Ghaaos"],
                16: [5367, 2, "Bosoios"],
                17: [5366, 1, "Hayzios"],
                19: [5082, 3, "Swahios"],
                20: [5081, 2, "Vesaos"],
                24: [4629, 4, "Pharios"],
                25: [4616, 1, "Ceraitia"],
                26: [4615, 2, "Zeusios"],
                32: [3976, 2, "Itoutia"],
                33: [3978, 4, "Loinnaios"],
                38: [3966, 1, "Launeios"],
                39: [3965, 4, "Rhawoos"],
                42: [3313, 4, "Chralios"],
                43: [3312, 3, "Senios"],
                54: [3269, 2, "Katios"],
                55: [3268, 4, "Domios"],
                57: [3257, 1, "Issetia"],
                58: [3256, 4, "Leirios"],
                59: [3253, 1, "Yerutia"],
                60: [3252, 4, "Taneuos"],
                61: [3251, 3, "Emyos"],
                62: [3250, 2, "Sereeos"],
                67: [3227, 3, "Ceuzios"],
                68: [3228, 4, "Deanios"],
                69: [3223, 3, "Seudios"],
                70: [3224, 4, "Banaeos"],
                72: [3219, 2, "Beeryios"],
                73: [3220, 3, "Sloipyios"],
                75: [3887, 3, "Taiaos"],
                76: [3886, 2, "Olduitia"],
                78: [3877, 3, "Onoetia"],
                79: [3876, 2, "Quiroios"],
                82: [3871, 2, "Loroeos"],
                83: [3872, 3, "Shaulaios"],
                84: [3874, 4, "Taiiaos"],
                86: [4496, 1, "Bylios"],
                87: [4498, 2, "Kimeitia"],
                89: [4505, 1, "Pimoios"],
                90: [4504, 2, "Tiaetia"],
                92: [4998, 3, "Zysaos"],
                93: [4999, 4, "Ineetia"],
                98: [5058, 1, "Soikoios"],
                99: [5056, 4, "Saeheios"]
            },
            94: {
                4: [5599, 1, "Toratia"],
                5: [5600, 2, "Mumios"],
                10: [5565, 3, "Janeios"],
                11: [5563, 1, "Daraeos"],
                12: [5561, 3, "Zykaios"],
                13: [5559, 1, "Vythyios"],
                15: [5370, 1, "Dyhios"],
                16: [5369, 4, "Meyfios"],
                17: [5368, 3, "Iruos"],
                19: [5083, 4, "Enutia"],
                20: [5080, 1, "Gaunios"],
                21: [5078, 3, "Inaeatia"],
                22: [5077, 2, "Dreerios"],
                26: [4625, 3, "Yykuos"],
                27: [4626, 4, "Seruos"],
                29: [4613, 1, "Shosiios"],
                30: [4611, 3, "Jienios"],
                32: [3977, 3, "Loejios"],
                33: [3979, 1, "Smeneios"],
                34: [3981, 3, "Croilios"],
                36: [3970, 4, "Naesios"],
                37: [3968, 3, "Nydaios"],
                38: [3967, 2, "Tayzios"],
                39: [3964, 3, "Tinaos"],
                40: [3961, 2, "Lloocyios"],
                45: [3950, 2, "Aretia"],
                46: [3949, 1, "Deusios"],
                48: [3936, 4, "Schuseios"],
                49: [3935, 3, "Juldeos"],
                51: [3933, 4, "Ryckoos"],
                52: [3932, 3, "Saycios"],
                57: [3259, 3, "Ateos"],
                58: [3258, 2, "Skelios"],
                59: [3255, 3, "Hunuios"],
                60: [3254, 2, "Omeutia"],
                64: [3911, 3, "Lumios"],
                65: [3910, 2, "Kimytia"],
                75: [3889, 1, "Phiwios"],
                76: [3888, 4, "Whealloos"],
                78: [3879, 1, "Cutios"],
                79: [3878, 4, "Darooos"],
                80: [3880, 2, "Tanaios"],
                92: [5000, 1, "Tiaautia"],
                93: [5001, 2, "Chroemios"],
                95: [5036, 4, "Snimios"],
                96: [5038, 2, "Essutia"]
            },
            95: {
                1: [5624, 1, "Sydios"],
                2: [5625, 4, "Lysios"],
                4: [5602, 4, "Sainios"],
                5: [5601, 3, "Pediios"],
                7: [5585, 1, "Lorios"],
                8: [5584, 4, "Ighteitia"],
                10: [5572, 4, "Aneos"],
                11: [5571, 2, "Llanios"],
                12: [5562, 4, "Tresios"],
                13: [5560, 2, "Tanatia"],
                15: [5371, 3, "Neugios"],
                16: [5372, 2, "Naloutia"],
                21: [5079, 4, "Yykios"],
                22: [5076, 1, "Draunios"],
                23: [5073, 4, "Cheeuos"],
                24: [5072, 2, "Vuroios"],
                26: [4627, 1, "Blotios"],
                27: [4628, 2, "Risaitia"],
                29: [4612, 4, "Ineautia"],
                30: [4610, 2, "Duyios"],
                33: [3980, 2, "Wiasios"],
                34: [3982, 4, "Zeyios"],
                36: [3971, 2, "Osuos"],
                37: [3969, 1, "Slerios"],
                39: [3963, 4, "Munneios"],
                40: [3962, 1, "Imetia"],
                42: [3959, 3, "Fialaos"],
                43: [3958, 2, "Swolios"],
                44: [3957, 1, "Woruios"],
                45: [3952, 4, "Zyfaios"],
                46: [3951, 3, "Pupios"],
                48: [3937, 1, "Sinoios"],
                49: [3938, 2, "Sohoios"],
                51: [3934, 1, "Moreeos"],
                52: [3931, 2, "Sourios"],
                53: [3930, 1, "Cuvios"],
                54: [3927, 2, "Kaloos"],
                55: [3926, 1, "Bifios"],
                62: [3914, 2, "Bozios"],
                63: [3913, 1, "Cladios"],
                64: [3912, 4, "Yeraios"],
                65: [3909, 1, "Issayos"],
                66: [3906, 2, "Yereos"],
                67: [3905, 1, "Gosoos"],
                69: [3901, 1, "Isuos"],
                70: [3899, 3, "Noekiios"],
                71: [3897, 1, "Eldaios"],
                72: [3895, 3, "Slykoos"],
                74: [3892, 4, "Rhekyos"],
                75: [3891, 3, "Quordeios"],
                76: [3890, 2, "Ildietia"],
                78: [3883, 2, "Tayboos"],
                79: [3881, 3, "Fukyos"],
                80: [3882, 1, "Chrifiios"],
                82: [4506, 4, "Esseytia"],
                83: [4509, 2, "Zhacios"],
                84: [4510, 1, "Sewios"],
                85: [4513, 3, "Rilaetia"],
                87: [4988, 1, "Asheetia"],
                88: [4989, 2, "Undeytia"],
                90: [5005, 1, "Yozaos"],
                91: [5004, 2, "Tundoos"],
                92: [5002, 3, "Lelaios"],
                93: [5003, 4, "Hacios"],
                95: [5037, 1, "Engouos"],
                96: [5039, 3, "Cloloios"],
                97: [5044, 1, "Atuios"],
                98: [5045, 4, "Nyotia"]
            },
            96: {
                1: [5622, 2, "Zusios"],
                2: [5621, 3, "Fuinios"],
                7: [5587, 3, "Clutaos"],
                8: [5586, 2, "Athitia"],
                18: [5360, 1, "Deexios"],
                19: [5359, 4, "Worotia"],
                22: [5086, 2, "Atheeos"],
                23: [5075, 3, "Strilios"],
                24: [5074, 1, "Tigios"],
                30: [4609, 1, "Toonios"],
                31: [4606, 3, "Rilaos"],
                42: [3960, 1, "Throimios"],
                43: [3956, 4, "Wumios"],
                44: [3955, 3, "Kynios"],
                45: [3954, 2, "Areios"],
                46: [3953, 1, "Crelios"],
                48: [3940, 4, "Cowios"],
                49: [3939, 3, "Redios"],
                54: [3929, 4, "Cesaos"],
                55: [3928, 3, "Liakuios"],
                57: [3923, 1, "Tyruos"],
                58: [3922, 4, "Kotios"],
                59: [3919, 1, "Ruisiios"],
                60: [3918, 4, "Smeildaios"],
                62: [3915, 3, "Thacios"],
                63: [3916, 4, "Shaisios"],
                64: [3917, 2, "Clotios"],
                66: [3908, 4, "Woekeios"],
                67: [3907, 3, "Beleutia"],
                69: [3902, 2, "Isios"],
                70: [3900, 4, "Whoraos"],
                71: [3898, 2, "Ceroeos"],
                72: [3896, 4, "Nyios"],
                74: [3893, 1, "Vefoos"],
                75: [3894, 2, "Nuneos"],
                82: [4507, 1, "Smalios"],
                83: [4508, 3, "Cledios"],
                84: [4511, 4, "Aroos"],
                85: [4512, 2, "Claehoios"],
                87: [4990, 3, "Inaoos"],
                88: [4991, 4, "Untaos"],
                90: [5007, 4, "Thrihios"],
                91: [5006, 3, "Chreasaios"],
                96: [5040, 4, "Chruwios"],
                97: [5043, 2, "Endetia"],
                98: [5046, 3, "Ageeetia"]
            },
            97: {
                1: [5623, 4, "Lluroios"],
                2: [5620, 1, "Dumaos"],
                3: [5618, 2, "Slaheos"],
                4: [5616, 1, "Steuzios"],
                5: [5614, 2, "Roivaos"],
                7: [5589, 1, "Oriatia"],
                8: [5588, 4, "Stretheios"],
                9: [5592, 3, "Sheceos"],
                11: [5582, 1, "Draeatia"],
                12: [5574, 4, "Buruos"],
                13: [5573, 1, "Clehios"],
                15: [5558, 3, "Deeyios"],
                16: [5557, 2, "Nomaos"],
                18: [5361, 3, "Getios"],
                19: [5357, 2, "Yaycios"],
                20: [5356, 1, "Beigios"],
                26: [5064, 2, "Nuneios"],
                27: [5062, 4, "Mosuios"],
                28: [5059, 2, "Sharios"],
                30: [4608, 2, "Emeaos"],
                31: [4607, 4, "Meamaos"],
                32: [4602, 3, "Booduios"],
                33: [4601, 2, "Echayos"],
                35: [4599, 2, "Chroyyos"],
                36: [4594, 1, "Radoos"],
                37: [4593, 4, "Roreios"],
                39: [4584, 2, "Smuvios"],
                40: [4583, 1, "Lyeeutia"],
                49: [3941, 1, "Rekios"],
                50: [3942, 2, "Whijaos"],
                51: [3945, 4, "Lajios"],
                52: [3946, 3, "Therios"],
                57: [3925, 3, "Qualios"],
                58: [3924, 2, "Onutia"],
                59: [3921, 3, "Aditia"],
                60: [3920, 2, "Ardiatia"],
                71: [3904, 1, "Lifiios"],
                72: [3903, 3, "Coekios"],
                77: [4518, 4, "Chrateos"],
                78: [4520, 3, "Phulyos"],
                79: [4522, 4, "Echauos"],
                80: [4524, 2, "Etietia"],
                84: [4515, 1, "Verootia"],
                85: [4514, 3, "Lusios"],
                87: [4992, 1, "Mosoitia"],
                88: [4993, 2, "Naraios"],
                93: [5032, 2, "Elmutia"],
                94: [5033, 4, "Toriatia"],
                96: [5041, 1, "Reisios"],
                97: [5042, 3, "Drihios"]
            },
            98: {
                3: [5619, 3, "Ightieos"],
                4: [5617, 4, "Lloekoios"],
                5: [5615, 3, "Doulios"],
                7: [5591, 3, "Bopios"],
                8: [5590, 2, "Nytuos"],
                9: [5593, 1, "Zhysios"],
                11: [5583, 2, "Degios"],
                12: [5576, 3, "Aldatia"],
                13: [5575, 2, "Thraudyos"],
                15: [5556, 1, "Asoos"],
                16: [5555, 4, "Queurios"],
                19: [5358, 3, "Nesios"],
                20: [5355, 4, "Dyloios"],
                21: [5352, 3, "Cheotia"],
                22: [5351, 4, "Angooos"],
                23: [5348, 1, "Rendiios"],
                24: [5347, 4, "Leritia"],
                26: [5065, 3, "Kinaios"],
                27: [5063, 1, "Ackautia"],
                28: [5060, 3, "Trytios"],
                31: [4614, 2, "Whartiios"],
                32: [4604, 1, "Regios"],
                33: [4603, 4, "Saihuos"],
                35: [4600, 4, "Cranios"],
                36: [4596, 3, "Slobios"],
                37: [4595, 2, "Keilaios"],
                39: [4586, 4, "Thratyios"],
                40: [4585, 3, "Clouxoios"],
                41: [4588, 2, "Voroos"],
                42: [4590, 4, "Thupios"],
                44: [4580, 3, "Darios"],
                45: [4579, 2, "Chacoios"],
                46: [4576, 3, "Lakiios"],
                47: [4575, 2, "Uskios"],
                49: [3944, 4, "Hatetia"],
                50: [3943, 3, "Rynytia"],
                51: [3947, 1, "Kineitia"],
                52: [3948, 2, "Chrehios"],
                54: [4559, 2, "Elmietia"],
                55: [4560, 4, "Ageuos"],
                62: [4555, 1, "Quoghyios"],
                63: [4553, 2, "Tyxios"],
                64: [4551, 1, "Sweifios"],
                65: [4549, 2, "Lyeeos"],
                66: [4547, 1, "Taieuos"],
                68: [4540, 2, "Foukios"],
                69: [4539, 3, "Schokios"],
                74: [4531, 4, "Rhielaios"],
                75: [4532, 1, "Rotheos"],
                77: [4519, 1, "Adieos"],
                78: [4521, 2, "Eldatia"],
                79: [4523, 1, "Nyntuios"],
                80: [4525, 3, "Swessoos"],
                81: [4528, 2, "Ranootia"],
                82: [4529, 3, "Notios"],
                84: [4517, 4, "Jeykios"],
                85: [4516, 2, "Yeerios"],
                87: [4994, 3, "Fybios"],
                88: [4995, 4, "Uskatia"],
                90: [5024, 1, "Chroudios"],
                91: [5026, 3, "Taulaios"],
                92: [5028, 1, "Tonios"],
                93: [5030, 3, "Modios"],
                94: [5034, 1, "Ighteatia"]
            },
            99: {
                12: [5579, 4, "Seadios"],
                13: [5577, 1, "Suwuios"],
                16: [5553, 2, "Phohios"],
                17: [5551, 3, "Whoerraos"],
                21: [5354, 1, "Saehios"],
                22: [5353, 2, "Nysitia"],
                23: [5350, 3, "Aweyos"],
                24: [5349, 2, "Emotia"],
                28: [5068, 4, "Coilios"],
                29: [5070, 1, "Trekoos"],
                36: [4598, 1, "Kinitia"],
                37: [4597, 4, "Yagios"],
                39: [4592, 2, "Heudios"],
                40: [4587, 1, "Jokios"],
                41: [4589, 3, "Lluhios"],
                42: [4591, 1, "Dearios"],
                44: [4582, 1, "Dathaios"],
                45: [4581, 4, "Duisoios"],
                46: [4578, 1, "Alduios"],
                47: [4577, 4, "Michaios"],
                54: [4561, 3, "Turiatia"],
                55: [4562, 1, "Dajios"],
                56: [4563, 2, "Sayetia"],
                57: [4565, 4, "Sulotia"],
                58: [4567, 2, "Jeduios"],
                59: [4569, 4, "Slierios"],
                60: [4571, 2, "Iryos"],
                62: [4556, 4, "Theriatia"],
                63: [4554, 3, "Verytia"],
                64: [4552, 4, "Slaydoos"],
                65: [4550, 3, "Samoetia"],
                66: [4548, 4, "Iroeos"],
                68: [4542, 4, "Shymios"],
                69: [4541, 1, "Rhethoos"],
                70: [4545, 2, "Ghaotia"],
                72: [4536, 1, "Sletios"],
                73: [4535, 2, "Emoutia"],
                74: [4534, 3, "Undeos"],
                75: [4533, 2, "Batyos"],
                80: [4526, 4, "Rakaeos"],
                81: [4527, 1, "Basaios"],
                82: [4530, 4, "Foisoos"],
                90: [5025, 2, "Caufios"],
                91: [5027, 4, "Pholios"],
                92: [5029, 2, "Troucios"],
                93: [5031, 4, "Oughuos"],
                94: [5035, 2, "Honeatia"]
            },
            100: {
                12: [5581, 3, "Stodeios"],
                13: [5580, 2, "Myraios"],
                16: [5554, 4, "Nousaos"],
                17: [5552, 1, "Sulootia"],
                28: [5069, 3, "Raykios"],
                29: [5071, 2, "Phoirios"],
                54: [4574, 2, "Skelitia"],
                55: [4573, 4, "Jidios"],
                56: [4564, 3, "Kunios"],
                57: [4566, 1, "Awuos"],
                58: [4568, 3, "Maebios"],
                59: [4570, 1, "Cryhios"],
                60: [4572, 3, "Tanotia"],
                65: [4558, 2, "Saemaios"],
                66: [4557, 1, "Sigoios"],
                68: [4544, 2, "Eneaos"],
                69: [4543, 3, "Bikios"],
                70: [4546, 4, "Dodios"],
                72: [4537, 4, "Garetia"],
                73: [4538, 3, "Swudios"]
            }
        };
    }
};




const POSITIONS = {
    // palace
    "palace": [
        {"x": 40, "y": 20},		// positioning the icon
        {"x": 10, "y": 96}		// positioning the info box
    ],

    // palaceColony
    "palaceColony": [
        {"x": 40, "y": 30},
        {"x": 10, "y": 96}
    ],

    // academy
    "academy": [
        {"x": 50, "y": 20},
        {"x": 20, "y": 12}
    ],

    // townHall
    "townHall": [
        {"x": 50, "y": 30},
        {"x": 10, "y": 38}
    ],

    // architect
    "architect": [
        {"x": 40, "y": 25},
        {"x": 22, "y": 18}
    ],

    // safehouse
    "safehouse": [
        {"x": 40, "y": 25},
        {"x": -6, "y": -6}
    ],

    //wall
    "wall": [
        {"x": 90, "y": 0},
        {"x": 500, "y": 64}
    ],

    // shipyard
    "shipyard": [
        {"x": 30, "y": 30},
        {"x": 22, "y": 12}
    ],

    // port
    "port": [
        {"x": 85, "y": 42},
        {"x": 60, "y": 24}
    ],

    // glassblowing
    "glassblowing": [
        {"x": 50, "y": 20},
        {"x": 20, "y": 12}
    ],

    // warehouse
    "warehouse": [
        {"x": 40, "y": 25},
        {"x": 16, "y": 12}
    ],

    // museum
    "museum": [
        {"x": 45, "y": 20},
        {"x": 6, "y": 12}
    ],

    // workshop
    "workshop": [
        {"x": 30, "y": 25},
        {"x": 20, "y": 12}
    ],

    // forester
    "forester": [
        {"x": 10, "y": 20},
        {"x": 26, "y": 3}
    ],

    // optician
    "optician": [
        {"x": 43, "y": 20},
        {"x": 20, "y": 12}
    ],

    // barracks
    "barracks": [
        {"x": 50, "y": 20},
        {"x": 10, "y": 12}
    ],

    // carpentering
    "carpentering": [
        {"x": 50, "y": 20},
        {"x": 16, "y": 12}
    ],

    // embassy
    "embassy": [
        {"x": 40, "y": 20},
        {"x": 0, "y": 12}
    ],

    // stonemason
    "stonemason": [
        {"x": 50, "y": 23},
        {"x": 16, "y": 3}
    ],

    // fireworker
    "fireworker": [
        {"x": 50, "y": 25},
        {"x": 22, "y": 12}
    ],

    // winegrower
    "winegrower": [
        {"x": 50, "y": 30},
        {"x": 20, "y": 12}
    ],

    // vineyard
    "vineyard": [
        {"x": 50, "y": 30},
        {"x": 26, "y": 12}
    ],

    // tavern
    "tavern": [
        {"x": 40, "y": 20},
        {"x": 20, "y": 3}
    ],

    // alchemist
    "alchemist": [
        {"x": 50, "y": 20},
        {"x": 20, "y": 12}
    ],

    // branchOffice
    "branchOffice": [
        {"x": 50, "y": 30},
        {"x": 10, "y": 12}
    ],

    // temple
    "temple": [
        {"x": 26, "y": 30},
        {"x": -8, "y": 3}
    ],

    // dump
    "dump": [
        {"x": 37, "y": 20},
        {"x": 4, "y": 75}
    ],

    "pirateFortress": [
        {"x": 32, "y": 73},
        {"x": 32, "y": 73}
    ],

    "blackMarket": [//edit this position
        {"x": 50, "y": 20},
        {"x": 50, "y": 20}
    ],

    marineChartArchive: [
        {"x": 55, "y": 20},
        {"x": 55, "y": 20}
    ],
    // construction spot
    "constructionSite": [
        {"x": 65, "y": 20},
        {"x": 18, "y": 15},
        {"x": 18, "y": -40}	// special for colony and palace
    ]
};

const BUILDINGS = {
    "townHall": [
        {},
        {"wood": 158, "marble": 0},
        {"wood": 335, "marble": 0},
        {"wood": 623, "marble": 0},
        {"wood": 923, "marble": 285},
        {"wood": 1390, "marble": 551},
        {"wood": 2015, "marble": 936},
        {"wood": 2706, "marble": 1411},
        {"wood": 3661, "marble": 2091},
        {"wood": 4776, "marble": 2945},
        {"wood": 6173, "marble": 4072},
        {"wood": 8074, "marble": 5664},
        {"wood": 10281, "marble": 7637},
        {"wood": 13023, "marble": 10214},
        {"wood": 16424, "marble": 13575},
        {"wood": 20986, "marble": 18254},
        {"wood": 25423, "marble": 23250},
        {"wood": 32285, "marble": 31022},
        {"wood": 40232, "marble": 40599},
        {"wood": 49286, "marble": 52216},
        {"wood": 61207, "marble": 68069},
        {"wood": 74804, "marble": 87316},
        {"wood": 93956, "marble": 115101},
        {"wood": 113035, "marble": 145326},
        {"wood": 141594, "marble": 191053},
        {"wood": 170213, "marble": 241039},
        {"wood": 210011, "marble": 312128},
        {"wood": 258875, "marble": 403825},
        {"wood": 314902, "marble": 515593},
        {"wood": 387657, "marble": 666229},
        {"wood": 471194, "marble": 850031},
        {"wood": 572581, "marble": 1084293},
        {"wood": 695617, "marble": 1382827},
        {"wood": 854729, "marble": 1783721},
        {"wood": 1037816, "marble": 2273687},
        {"wood": 1274043, "marble": 2930330},
        {"wood": 1529212, "marble": 3692591},
        {"wood": 1876201, "marble": 4756439},
        {"wood": 2276286, "marble": 6058643},
        {"wood": 2761291, "marble": 7716366}
    ],

    "academy": [
        {"wood": 64, "glass": 0},
        {"wood": 68, "glass": 0},
        {"wood": 115, "glass": 0},
        {"wood": 263, "glass": 0},
        {"wood": 382, "glass": 225},
        {"wood": 626, "glass": 428},
        {"wood": 982, "glass": 744},
        {"wood": 1330, "glass": 1089},
        {"wood": 2004, "glass": 1748},
        {"wood": 2665, "glass": 2454},
        {"wood": 3916, "glass": 3786},
        {"wood": 5156, "glass": 5216},
        {"wood": 7446, "glass": 7862},
        {"wood": 9753, "glass": 10729},
        {"wood": 12751, "glass": 14599},
        {"wood": 18163, "glass": 21627},
        {"wood": 23691, "glass": 29322},
        {"wood": 33451, "glass": 43020},
        {"wood": 43572, "glass": 58213},
        {"wood": 56729, "glass": 78724},
        {"wood": 73833, "glass": 106414},
        {"wood": 103459, "glass": 154857},
        {"wood": 144203, "glass": 224146},
        {"wood": 175058, "glass": 282572},
        {"wood": 243930, "glass": 408877},
        {"wood": 317208, "glass": 552141},
        {"wood": 439968, "glass": 795252},
        {"wood": 536310, "glass": 1006648},
        {"wood": 743789, "glass": 1449741},
        {"wood": 1027470, "glass": 2079651},
        {"wood": 1257246, "glass": 2642548},
        {"wood": 1736683, "glass": 3790583}
    ],

    "warehouse": [
        {"wood": 160, "marble": 0},
        {"wood": 288, "marble": 0},
        {"wood": 442, "marble": 0},
        {"wood": 626, "marble": 96},
        {"wood": 847, "marble": 211},
        {"wood": 1113, "marble": 349},
        {"wood": 1431, "marble": 515},
        {"wood": 1813, "marble": 714},
        {"wood": 2272, "marble": 953},
        {"wood": 2822, "marble": 1240},
        {"wood": 3483, "marble": 1584},
        {"wood": 4275, "marble": 1997},
        {"wood": 5226, "marble": 2492},
        {"wood": 6368, "marble": 3086},
        {"wood": 7737, "marble": 3800},
        {"wood": 9380, "marble": 4656},
        {"wood": 11353, "marble": 5683},
        {"wood": 13719, "marble": 6915},
        {"wood": 16559, "marble": 8394},
        {"wood": 19967, "marble": 10169},
        {"wood": 24056, "marble": 12299},
        {"wood": 28963, "marble": 14855},
        {"wood": 34852, "marble": 17922},
        {"wood": 41918, "marble": 21602},
        {"wood": 50398, "marble": 26019},
        {"wood": 60574, "marble": 31319},
        {"wood": 72784, "marble": 37678},
        {"wood": 87437, "marble": 45310},
        {"wood": 105021, "marble": 54468},
        {"wood": 126121, "marble": 65458},
        {"wood": 151441, "marble": 78645},
        {"wood": 181825, "marble": 94471},
        {"wood": 218286, "marble": 113461},
        {"wood": 262039, "marble": 136249},
        {"wood": 314543, "marble": 163595},
        {"wood": 377548, "marble": 196409},
        {"wood": 453153, "marble": 235787},
        {"wood": 543880, "marble": 283041},
        {"wood": 652752, "marble": 339745},
        {"wood": 783398, "marble": 407790}
    ],

    "tavern": [
        {"wood": 101, "marble": 0},
        {"wood": 222, "marble": 0},
        {"wood": 367, "marble": 0},
        {"wood": 541, "marble": 94},
        {"wood": 750, "marble": 122},
        {"wood": 1001, "marble": 158},
        {"wood": 1302, "marble": 206},
        {"wood": 1663, "marble": 267},
        {"wood": 2097, "marble": 348},
        {"wood": 2617, "marble": 452},
        {"wood": 3241, "marble": 587},
        {"wood": 3990, "marble": 764},
        {"wood": 4888, "marble": 993},
        {"wood": 5967, "marble": 1290},
        {"wood": 7261, "marble": 1677},
        {"wood": 8814, "marble": 2181},
        {"wood": 10678, "marble": 2835},
        {"wood": 12914, "marble": 3685},
        {"wood": 15598, "marble": 4791},
        {"wood": 18818, "marble": 6228},
        {"wood": 22683, "marble": 8097},
        {"wood": 27320, "marble": 10526},
        {"wood": 32885, "marble": 13684},
        {"wood": 39562, "marble": 17789},
        {"wood": 47576, "marble": 23125},
        {"wood": 57192, "marble": 30063},
        {"wood": 68731, "marble": 39082},
        {"wood": 82578, "marble": 50806},
        {"wood": 99194, "marble": 66048},
        {"wood": 119134, "marble": 85862},
        {"wood": 143061, "marble": 111621},
        {"wood": 171774, "marble": 145107},
        {"wood": 206230, "marble": 188640},
        {"wood": 247577, "marble": 245232},
        {"wood": 297193, "marble": 318801},
        {"wood": 356732, "marble": 414441},
        {"wood": 428179, "marble": 538774},
        {"wood": 513916, "marble": 700406},
        {"wood": 616800, "marble": 910528},
        {"wood": 740261, "marble": 1183686},
        {"wood": 888414, "marble": 1538792},
        {"wood": 1066197, "marble": 2000429},
        {"wood": 1279538, "marble": 2600558},
        {"wood": 1535546, "marble": 3380726},
        {"wood": 1842756, "marble": 4394943},
        {"wood": 2211408, "marble": 5713427},
        {"wood": 2653790, "marble": 7427454}
    ],

    "palace": [
        {"wood": 712, "wine": 0, "marble": 0, "glass": 0, "sulfur": 0},
        {"wood": 5824, "wine": 0, "marble": 1434, "glass": 0, "sulfur": 0},
        {"wood": 16048, "wine": 0, "marble": 4546, "glass": 0, "sulfur": 3089},
        {"wood": 36496, "wine": 10898, "marble": 10770, "glass": 0, "sulfur": 10301},
        {"wood": 77392, "wine": 22110, "marble": 23218, "glass": 21188, "sulfur": 24725},
        {"wood": 159184, "wine": 44534, "marble": 48114, "glass": 42400, "sulfur": 53573},
        {"wood": 322768, "wine": 89382, "marble": 97906, "glass": 84824, "sulfur": 111269},
        {"wood": 649936, "wine": 179078, "marble": 197490, "glass": 169672, "sulfur": 226661},
        {"wood": 1304272, "wine": 358470, "marble": 396658, "glass": 339368, "sulfur": 457445},
        {"wood": 2612944, "wine": 717254, "marble": 794994, "glass": 678760, "sulfur": 919013},
        {"wood": 4743518, "wine": 1434822, "marble": 1591666, "glass": 1357544, "sulfur": 1842149}
    ],

    "palaceColony": [
        {"wood": 712, "wine": 0, "marble": 0, "glass": 0, "sulfur": 0},
        {"wood": 5824, "wine": 0, "marble": 1434, "glass": 0, "sulfur": 0},
        {"wood": 16048, "wine": 0, "marble": 4546, "glass": 0, "sulfur": 3089},
        {"wood": 36496, "wine": 10898, "marble": 10770, "glass": 0, "sulfur": 10301},
        {"wood": 77392, "wine": 22110, "marble": 23218, "glass": 21188, "sulfur": 24725},
        {"wood": 159184, "wine": 44534, "marble": 48114, "glass": 42400, "sulfur": 53573},
        {"wood": 322768, "wine": 89382, "marble": 97906, "glass": 84824, "sulfur": 111269},
        {"wood": 649936, "wine": 179078, "marble": 197490, "glass": 169672, "sulfur": 226661},
        {"wood": 1304272, "wine": 358470, "marble": 396658, "glass": 339368, "sulfur": 457445},
        {"wood": 2612944, "wine": 717254, "marble": 794994, "glass": 678760, "sulfur": 919013},
        {"wood": 4743518, "wine": 1434822, "marble": 1591666, "glass": 1357544, "sulfur": 1842149}
    ],

    "museum": [
        {"wood": 560, "marble": 280},
        {"wood": 1435, "marble": 1190},
        {"wood": 2748, "marble": 2573},
        {"wood": 4716, "marble": 4676},
        {"wood": 7669, "marble": 7871},
        {"wood": 12099, "marble": 12729},
        {"wood": 18744, "marble": 20112},
        {"wood": 28710, "marble": 31335},
        {"wood": 43661, "marble": 48394},
        {"wood": 66086, "marble": 74323},
        {"wood": 99724, "marble": 113736},
        {"wood": 150181, "marble": 173643},
        {"wood": 225866, "marble": 264701},
        {"wood": 339394, "marble": 403110},
        {"wood": 509686, "marble": 613492},
        {"wood": 765124, "marble": 933272},
        {"wood": 1148281, "marble": 1419338},
        {"wood": 1723017, "marble": 2158158},
        {"wood": 2585121, "marble": 3281165},
        {"wood": 3878276, "marble": 4988136},
        {"wood": 5818009, "marble": 7582731}
    ],

    "port": [
        {"wood": 60, "marble": 0},
        {"wood": 150, "marble": 0},
        {"wood": 274, "marble": 0},
        {"wood": 429, "marble": 0},
        {"wood": 637, "marble": 0},
        {"wood": 894, "marble": 176},
        {"wood": 1207, "marble": 326},
        {"wood": 1645, "marble": 540},
        {"wood": 2106, "marble": 791},
        {"wood": 2735, "marble": 1138},
        {"wood": 3537, "marble": 1598},
        {"wood": 4492, "marble": 2176},
        {"wood": 5689, "marble": 2928},
        {"wood": 7103, "marble": 3859},
        {"wood": 8850, "marble": 5051},
        {"wood": 11094, "marble": 6628},
        {"wood": 13731, "marble": 8566},
        {"wood": 17062, "marble": 11089},
        {"wood": 21097, "marble": 14265},
        {"wood": 25965, "marble": 18241},
        {"wood": 31810, "marble": 23197},
        {"wood": 39190, "marble": 29642},
        {"wood": 47998, "marble": 37636},
        {"wood": 58713, "marble": 47703},
        {"wood": 71955, "marble": 60556},
        {"wood": 87627, "marble": 76367},
        {"wood": 107102, "marble": 96639},
        {"wood": 130777, "marble": 122157},
        {"wood": 159020, "marble": 153754},
        {"wood": 193938, "marble": 194090},
        {"wood": 235849, "marble": 244301},
        {"wood": 286515, "marble": 307174},
        {"wood": 348718, "marble": 386956},
        {"wood": 423990, "marble": 486969},
        {"wood": 513947, "marble": 610992},
        {"wood": 625161, "marble": 769303},
        {"wood": 758178, "marble": 965794},
        {"wood": 919694, "marble": 1212791},
        {"wood": 1116013, "marble": 1523572},
        {"wood": 1353517, "marble": 1913073},
        {"wood": 1642275, "marble": 2403314},
        {"wood": 1990224, "marble": 3015689},
        {"wood": 2411062, "marble": 3782993},
        {"wood": 2923229, "marble": 4749576},
        {"wood": 3541580, "marble": 5959027},
        {"wood": 4291524, "marble": 7478201},
        {"wood": 5199343, "marble": 9383420}
    ],

    "shipyard": [
        {"wood": 105, "marble": 0},
        {"wood": 202, "marble": 0},
        {"wood": 324, "marble": 0},
        {"wood": 477, "marble": 0},
        {"wood": 671, "marble": 0},
        {"wood": 914, "marble": 778},
        {"wood": 1222, "marble": 1052},
        {"wood": 1609, "marble": 1397},
        {"wood": 2096, "marble": 1832},
        {"wood": 2711, "marble": 2381},
        {"wood": 3485, "marble": 3071},
        {"wood": 4460, "marble": 3942},
        {"wood": 5689, "marble": 5038},
        {"wood": 7238, "marble": 6420},
        {"wood": 9190, "marble": 8161},
        {"wood": 11648, "marble": 10354},
        {"wood": 14746, "marble": 13118},
        {"wood": 18650, "marble": 16601},
        {"wood": 23568, "marble": 20989},
        {"wood": 29765, "marble": 26517},
        {"wood": 37573, "marble": 33484},
        {"wood": 47412, "marble": 42261},
        {"wood": 59808, "marble": 53321},
        {"wood": 75428, "marble": 67256},
        {"wood": 95108, "marble": 84814},
        {"wood": 119906, "marble": 106938},
        {"wood": 151151, "marble": 134814},
        {"wood": 190520, "marble": 169937},
        {"wood": 240124, "marble": 214192},
        {"wood": 302626, "marble": 269954},
        {"wood": 381378, "marble": 340214},
        {"wood": 480605, "marble": 428741},
        {"wood": 605632, "marble": 540286},
        {"wood": 763166, "marble": 680832},
        {"wood": 961659, "marble": 857920},
        {"wood": 1211759, "marble": 1081051},
        {"wood": 1526886, "marble": 1362196},
        {"wood": 1923946, "marble": 1716438}
    ],

    "barracks": [
        {"wood": 49, "marble": 0},
        {"wood": 114, "marble": 0},
        {"wood": 195, "marble": 0},
        {"wood": 296, "marble": 0},
        {"wood": 420, "marble": 0},
        {"wood": 574, "marble": 0},
        {"wood": 766, "marble": 0},
        {"wood": 1003, "marble": 0},
        {"wood": 1297, "marble": 178},
        {"wood": 1662, "marble": 431},
        {"wood": 2115, "marble": 745},
        {"wood": 2676, "marble": 1134},
        {"wood": 3371, "marble": 1616},
        {"wood": 4234, "marble": 2214},
        {"wood": 5304, "marble": 2956},
        {"wood": 6630, "marble": 3875},
        {"wood": 8275, "marble": 5015},
        {"wood": 10314, "marble": 6429},
        {"wood": 12843, "marble": 8183},
        {"wood": 15979, "marble": 10357},
        {"wood": 19868, "marble": 13052},
        {"wood": 24690, "marble": 16395},
        {"wood": 30669, "marble": 20540},
        {"wood": 38083, "marble": 25680},
        {"wood": 47277, "marble": 32054},
        {"wood": 58676, "marble": 39957},
        {"wood": 72812, "marble": 49757},
        {"wood": 90341, "marble": 61909},
        {"wood": 112076, "marble": 76977},
        {"wood": 139028, "marble": 95661},
        {"wood": 172448, "marble": 118830},
        {"wood": 213889, "marble": 147560},
        {"wood": 265276, "marble": 183185},
        {"wood": 328996, "marble": 227359},
        {"wood": 408008, "marble": 282136},
        {"wood": 505984, "marble": 350059},
        {"wood": 627473, "marble": 434283},
        {"wood": 778120, "marble": 538721},
        {"wood": 964923, "marble": 668224},
        {"wood": 1196558, "marble": 828808},
        {"wood": 1483785, "marble": 1027932},
        {"wood": 1839947, "marble": 1274847},
        {"wood": 2281588, "marble": 1581020},
        {"wood": 2829223, "marble": 1960675},
        {"wood": 3508290, "marble": 2431447},
        {"wood": 4350333, "marble": 3015205},
        {"wood": 5394466, "marble": 3739064},
        {"wood": 6689191, "marble": 4636650},
        {"wood": 8294651, "marble": 5749656}
    ],

    "wall": [
        {"wood": 114, "marble": 0},
        {"wood": 361, "marble": 203},
        {"wood": 657, "marble": 516},
        {"wood": 1012, "marble": 892},
        {"wood": 1439, "marble": 1344},
        {"wood": 1951, "marble": 1885},
        {"wood": 2565, "marble": 2535},
        {"wood": 3302, "marble": 3315},
        {"wood": 4186, "marble": 4251},
        {"wood": 5247, "marble": 5374},
        {"wood": 6521, "marble": 6721},
        {"wood": 8049, "marble": 8338},
        {"wood": 9882, "marble": 10279},
        {"wood": 12083, "marble": 12608},
        {"wood": 14724, "marble": 15402},
        {"wood": 17892, "marble": 18755},
        {"wood": 21695, "marble": 22779},
        {"wood": 26258, "marble": 27607},
        {"wood": 31733, "marble": 33402},
        {"wood": 38304, "marble": 40355},
        {"wood": 46189, "marble": 48699},
        {"wood": 55650, "marble": 58711},
        {"wood": 67004, "marble": 70726},
        {"wood": 80629, "marble": 85144},
        {"wood": 96979, "marble": 102446},
        {"wood": 116599, "marble": 123208},
        {"wood": 140143, "marble": 148122},
        {"wood": 168395, "marble": 178019},
        {"wood": 202298, "marble": 213896},
        {"wood": 242982, "marble": 256948},
        {"wood": 291802, "marble": 308610},
        {"wood": 350387, "marble": 370605},
        {"wood": 420688, "marble": 444998},
        {"wood": 505050, "marble": 534271},
        {"wood": 606284, "marble": 641398},
        {"wood": 727765, "marble": 769950},
        {"wood": 873542, "marble": 924213},
        {"wood": 1048474, "marble": 1109329},
        {"wood": 1258393, "marble": 1331467},
        {"wood": 1510295, "marble": 1598033},
        {"wood": 1812578, "marble": 1917913},
        {"wood": 2175318, "marble": 2301768},
        {"wood": 2610605, "marble": 2762394},
        {"wood": 3132950, "marble": 3315146},
        {"wood": 3759764, "marble": 3978448},
        {"wood": 4511941, "marble": 4774411},
        {"wood": 5414554, "marble": 5729566},
        {"wood": 6497688, "marble": 6875751}
    ],

    "embassy": [
        {"wood": 242, "marble": 155},
        {"wood": 415, "marble": 342},
        {"wood": 623, "marble": 571},
        {"wood": 873, "marble": 850},
        {"wood": 1173, "marble": 1190},
        {"wood": 1532, "marble": 1606},
        {"wood": 1964, "marble": 2112},
        {"wood": 2482, "marble": 2730},
        {"wood": 3103, "marble": 3484},
        {"wood": 3849, "marble": 4404},
        {"wood": 4743, "marble": 5527},
        {"wood": 5817, "marble": 6896},
        {"wood": 7105, "marble": 8566},
        {"wood": 8651, "marble": 10604},
        {"wood": 10507, "marble": 13090},
        {"wood": 12733, "marble": 16123},
        {"wood": 15404, "marble": 19824},
        {"wood": 18610, "marble": 24339},
        {"wood": 22457, "marble": 29846},
        {"wood": 27074, "marble": 36566},
        {"wood": 32614, "marble": 44764},
        {"wood": 39261, "marble": 54765},
        {"wood": 47239, "marble": 66967},
        {"wood": 56811, "marble": 81853},
        {"wood": 68299, "marble": 100014},
        {"wood": 82084, "marble": 122170},
        {"wood": 98625, "marble": 149201},
        {"wood": 118475, "marble": 182178},
        {"wood": 142295, "marble": 222411},
        {"wood": 170879, "marble": 271495},
        {"wood": 205180, "marble": 331377},
        {"wood": 246341, "marble": 404433}
    ],

    "branchOffice": [
        {"wood": 48, "marble": 0},
        {"wood": 173, "marble": 0},
        {"wood": 346, "marble": 0},
        {"wood": 581, "marble": 0},
        {"wood": 896, "marble": 540},
        {"wood": 1314, "marble": 792},
        {"wood": 1863, "marble": 1123},
        {"wood": 2580, "marble": 1555},
        {"wood": 3509, "marble": 2115},
        {"wood": 4706, "marble": 2837},
        {"wood": 6241, "marble": 3762},
        {"wood": 8203, "marble": 4945},
        {"wood": 10699, "marble": 6450},
        {"wood": 13866, "marble": 8359},
        {"wood": 17872, "marble": 10774},
        {"wood": 22926, "marble": 13820},
        {"wood": 29286, "marble": 17654},
        {"wood": 37273, "marble": 22469},
        {"wood": 47283, "marble": 28503},
        {"wood": 59807, "marble": 36052},
        {"wood": 75448, "marble": 45482},
        {"wood": 94955, "marble": 57240},
        {"wood": 119245, "marble": 71883},
        {"wood": 149454, "marble": 90093},
        {"wood": 186977, "marble": 112713},
        {"wood": 233530, "marble": 140776},
        {"wood": 291226, "marble": 175556},
        {"wood": 362658, "marble": 218616},
        {"wood": 451015, "marble": 271879},
        {"wood": 560208, "marble": 337703},
        {"wood": 695038, "marble": 418980},
        {"wood": 861391, "marble": 519261},
        {"wood": 1066671, "marble": 643008},
        {"wood": 1319986, "marble": 795711},
        {"wood": 1632576, "marble": 984147},
        {"wood": 2018313, "marble": 1216678},
        {"wood": 2494313, "marble": 1503620},
        {"wood": 3081696, "marble": 1857706},
        {"wood": 3806527, "marble": 2294649}
    ],

    "workshop": [
        {"wood": 220, "marble": 95},
        {"wood": 383, "marble": 167},
        {"wood": 569, "marble": 251},
        {"wood": 781, "marble": 349},
        {"wood": 1023, "marble": 461},
        {"wood": 1299, "marble": 592},
        {"wood": 1613, "marble": 744},
        {"wood": 1972, "marble": 920},
        {"wood": 2380, "marble": 1125},
        {"wood": 2846, "marble": 1362},
        {"wood": 3377, "marble": 1637},
        {"wood": 3982, "marble": 1956},
        {"wood": 4672, "marble": 2326},
        {"wood": 5458, "marble": 2755},
        {"wood": 6355, "marble": 3253},
        {"wood": 7377, "marble": 3831},
        {"wood": 8542, "marble": 4501},
        {"wood": 9870, "marble": 5278},
        {"wood": 11385, "marble": 6180},
        {"wood": 13111, "marble": 7226},
        {"wood": 15079, "marble": 8439},
        {"wood": 17322, "marble": 9847},
        {"wood": 19880, "marble": 11479},
        {"wood": 22796, "marble": 13373},
        {"wood": 26119, "marble": 15570},
        {"wood": 29909, "marble": 18118},
        {"wood": 34228, "marble": 21074},
        {"wood": 39153, "marble": 24503},
        {"wood": 44766, "marble": 28481},
        {"wood": 51166, "marble": 33095},
        {"wood": 58462, "marble": 38447},
        {"wood": 66779, "marble": 44656}
    ],

    "safehouse": [
        {"wood": 113, "marble": 0},
        {"wood": 248, "marble": 0},
        {"wood": 402, "marble": 0},
        {"wood": 578, "marble": 129},
        {"wood": 779, "marble": 197},
        {"wood": 1007, "marble": 275},
        {"wood": 1267, "marble": 366},
        {"wood": 1564, "marble": 471},
        {"wood": 1903, "marble": 593},
        {"wood": 2288, "marble": 735},
        {"wood": 2728, "marble": 900},
        {"wood": 3230, "marble": 1090},
        {"wood": 3801, "marble": 1312},
        {"wood": 4453, "marble": 1569},
        {"wood": 5195, "marble": 1866},
        {"wood": 6042, "marble": 2212},
        {"wood": 7008, "marble": 2613},
        {"wood": 8108, "marble": 3078},
        {"wood": 9363, "marble": 3617},
        {"wood": 10793, "marble": 4243},
        {"wood": 12423, "marble": 4968},
        {"wood": 14282, "marble": 5810},
        {"wood": 16401, "marble": 6787},
        {"wood": 18816, "marble": 7919},
        {"wood": 21570, "marble": 9233},
        {"wood": 24709, "marble": 10758},
        {"wood": 28288, "marble": 12526},
        {"wood": 32368, "marble": 14577},
        {"wood": 37019, "marble": 16956},
        {"wood": 42321, "marble": 19716},
        {"wood": 48365, "marble": 22917},
        {"wood": 55255, "marble": 26631}
    ],

    "forester": [
        {"wood": 250, "marble": 0},
        {"wood": 430, "marble": 104},
        {"wood": 664, "marble": 237},
        {"wood": 968, "marble": 410},
        {"wood": 1364, "marble": 635},
        {"wood": 1878, "marble": 928},
        {"wood": 2546, "marble": 1309},
        {"wood": 3415, "marble": 1803},
        {"wood": 4544, "marble": 2446},
        {"wood": 6013, "marble": 3282},
        {"wood": 7922, "marble": 4368},
        {"wood": 10403, "marble": 5781},
        {"wood": 13629, "marble": 7617},
        {"wood": 17823, "marble": 10004},
        {"wood": 23274, "marble": 13108},
        {"wood": 30362, "marble": 17142},
        {"wood": 39575, "marble": 22387},
        {"wood": 51552, "marble": 29204},
        {"wood": 67123, "marble": 38068},
        {"wood": 87365, "marble": 49590},
        {"wood": 113680, "marble": 64569},
        {"wood": 147889, "marble": 84042},
        {"wood": 192360, "marble": 109357},
        {"wood": 250173, "marble": 142266},
        {"wood": 325330, "marble": 185047},
        {"wood": 423035, "marble": 240664},
        {"wood": 550050, "marble": 312965},
        {"wood": 715170, "marble": 406956},
        {"wood": 929826, "marble": 529145},
        {"wood": 1208879, "marble": 687990},
        {"wood": 1571647, "marble": 894489},
        {"wood": 2043247, "marble": 1162938}
    ],

    "glassblowing": [
        {"wood": 274, "marble": 0},
        {"wood": 467, "marble": 116},
        {"wood": 718, "marble": 255},
        {"wood": 1045, "marble": 436},
        {"wood": 1469, "marble": 671},
        {"wood": 2021, "marble": 977},
        {"wood": 2738, "marble": 1375},
        {"wood": 3671, "marble": 1892},
        {"wood": 4883, "marble": 2564},
        {"wood": 6459, "marble": 3437},
        {"wood": 8508, "marble": 4572},
        {"wood": 11172, "marble": 6049},
        {"wood": 14634, "marble": 7968},
        {"wood": 19135, "marble": 10462},
        {"wood": 24987, "marble": 13705},
        {"wood": 32594, "marble": 17921},
        {"wood": 42483, "marble": 23402},
        {"wood": 55339, "marble": 30527},
        {"wood": 72051, "marble": 39790},
        {"wood": 93778, "marble": 51831},
        {"wood": 122022, "marble": 67485},
        {"wood": 158740, "marble": 87835},
        {"wood": 206472, "marble": 114290},
        {"wood": 268525, "marble": 148681},
        {"wood": 349194, "marble": 193390},
        {"wood": 454063, "marble": 251512},
        {"wood": 590393, "marble": 327069},
        {"wood": 767621, "marble": 425295},
        {"wood": 998019, "marble": 552987},
        {"wood": 1297536, "marble": 718988},
        {"wood": 1686907, "marble": 934789},
        {"wood": 2193090, "marble": 1215330}
    ],

    "alchemist": [
        {"wood": 274, "marble": 0},
        {"wood": 467, "marble": 116},
        {"wood": 718, "marble": 255},
        {"wood": 1045, "marble": 436},
        {"wood": 1469, "marble": 671},
        {"wood": 2021, "marble": 977},
        {"wood": 2738, "marble": 1375},
        {"wood": 3671, "marble": 1892},
        {"wood": 4883, "marble": 2564},
        {"wood": 6459, "marble": 3437},
        {"wood": 8508, "marble": 4572},
        {"wood": 11172, "marble": 6049},
        {"wood": 14634, "marble": 7968},
        {"wood": 19135, "marble": 10462},
        {"wood": 24987, "marble": 13705},
        {"wood": 32594, "marble": 17921},
        {"wood": 42483, "marble": 23402},
        {"wood": 55339, "marble": 30527},
        {"wood": 72051, "marble": 39790},
        {"wood": 93778, "marble": 51831},
        {"wood": 122022, "marble": 67485},
        {"wood": 158740, "marble": 87835},
        {"wood": 206472, "marble": 114290},
        {"wood": 268525, "marble": 148681},
        {"wood": 349194, "marble": 193390},
        {"wood": 454063, "marble": 251512},
        {"wood": 590393, "marble": 327069},
        {"wood": 767621, "marble": 425295},
        {"wood": 998019, "marble": 552987},
        {"wood": 1297536, "marble": 718988},
        {"wood": 1686907, "marble": 934789},
        {"wood": 2193090, "marble": 1215330}
    ],

    "winegrower": [
        {"wood": 274, "marble": 0},
        {"wood": 467, "marble": 116},
        {"wood": 718, "marble": 255},
        {"wood": 1045, "marble": 436},
        {"wood": 1469, "marble": 671},
        {"wood": 2021, "marble": 977},
        {"wood": 2738, "marble": 1375},
        {"wood": 3671, "marble": 1892},
        {"wood": 4883, "marble": 2564},
        {"wood": 6459, "marble": 3437},
        {"wood": 8508, "marble": 4572},
        {"wood": 11172, "marble": 6049},
        {"wood": 14634, "marble": 7968},
        {"wood": 19135, "marble": 10462},
        {"wood": 24987, "marble": 13705},
        {"wood": 32594, "marble": 17921},
        {"wood": 42483, "marble": 23402},
        {"wood": 55339, "marble": 30527},
        {"wood": 72051, "marble": 39790},
        {"wood": 93778, "marble": 51831},
        {"wood": 122022, "marble": 67485},
        {"wood": 158740, "marble": 87835},
        {"wood": 206472, "marble": 114290},
        {"wood": 268525, "marble": 148681},
        {"wood": 349194, "marble": 193390},
        {"wood": 454063, "marble": 251512},
        {"wood": 590393, "marble": 327069},
        {"wood": 767621, "marble": 425295},
        {"wood": 998019, "marble": 552987},
        {"wood": 1297536, "marble": 718988},
        {"wood": 1686907, "marble": 934789},
        {"wood": 2193090, "marble": 1215330}
    ],

    "stonemason": [
        {"wood": 274, "marble": 0},
        {"wood": 467, "marble": 116},
        {"wood": 718, "marble": 255},
        {"wood": 1045, "marble": 436},
        {"wood": 1469, "marble": 671},
        {"wood": 2021, "marble": 977},
        {"wood": 2738, "marble": 1375},
        {"wood": 3671, "marble": 1892},
        {"wood": 4883, "marble": 2564},
        {"wood": 6459, "marble": 3437},
        {"wood": 8508, "marble": 4572},
        {"wood": 11172, "marble": 6049},
        {"wood": 14634, "marble": 7968},
        {"wood": 19135, "marble": 10462},
        {"wood": 24987, "marble": 13705},
        {"wood": 32594, "marble": 17921},
        {"wood": 42483, "marble": 23402},
        {"wood": 55339, "marble": 30527},
        {"wood": 72051, "marble": 39790},
        {"wood": 93778, "marble": 51831},
        {"wood": 122022, "marble": 67485},
        {"wood": 158740, "marble": 87835},
        {"wood": 206472, "marble": 114290},
        {"wood": 268525, "marble": 148681},
        {"wood": 349194, "marble": 193390},
        {"wood": 454063, "marble": 251512},
        {"wood": 590393, "marble": 327069},
        {"wood": 767621, "marble": 425295},
        {"wood": 998019, "marble": 552987},
        {"wood": 1297536, "marble": 718988},
        {"wood": 1686907, "marble": 934789},
        {"wood": 2193090, "marble": 1215330}
    ],

    "carpentering": [
        {"wood": 63, "marble": 0},
        {"wood": 122, "marble": 0},
        {"wood": 192, "marble": 0},
        {"wood": 274, "marble": 0},
        {"wood": 372, "marble": 0},
        {"wood": 486, "marble": 0},
        {"wood": 620, "marble": 0},
        {"wood": 777, "marble": 359},
        {"wood": 962, "marble": 444},
        {"wood": 1178, "marble": 546},
        {"wood": 1432, "marble": 669},
        {"wood": 1730, "marble": 816},
        {"wood": 2078, "marble": 993},
        {"wood": 2486, "marble": 1205},
        {"wood": 2964, "marble": 1459},
        {"wood": 3524, "marble": 1765},
        {"wood": 4178, "marble": 2131},
        {"wood": 4945, "marble": 2571},
        {"wood": 5841, "marble": 3098},
        {"wood": 6890, "marble": 3731},
        {"wood": 8117, "marble": 4491},
        {"wood": 9551, "marble": 5402},
        {"wood": 11229, "marble": 6496},
        {"wood": 13190, "marble": 7809},
        {"wood": 15484, "marble": 9384},
        {"wood": 18165, "marble": 11275},
        {"wood": 21299, "marble": 13543},
        {"wood": 24963, "marble": 16265},
        {"wood": 29245, "marble": 19531},
        {"wood": 34249, "marble": 23451},
        {"wood": 40096, "marble": 28154},
        {"wood": 46930, "marble": 33799}
    ],

    "optician": [
        {"wood": 119, "marble": 0},
        {"wood": 188, "marble": 35},
        {"wood": 269, "marble": 96},
        {"wood": 362, "marble": 167},
        {"wood": 471, "marble": 249},
        {"wood": 597, "marble": 345},
        {"wood": 742, "marble": 455},
        {"wood": 912, "marble": 584},
        {"wood": 1108, "marble": 733},
        {"wood": 1335, "marble": 905},
        {"wood": 1600, "marble": 1106},
        {"wood": 1906, "marble": 1338},
        {"wood": 2261, "marble": 1608},
        {"wood": 2673, "marble": 1921},
        {"wood": 3152, "marble": 2283},
        {"wood": 3706, "marble": 2704},
        {"wood": 4350, "marble": 3192},
        {"wood": 5096, "marble": 3759},
        {"wood": 5962, "marble": 4416},
        {"wood": 6966, "marble": 5178},
        {"wood": 8131, "marble": 6062},
        {"wood": 9482, "marble": 7087},
        {"wood": 11050, "marble": 8276},
        {"wood": 12868, "marble": 9656},
        {"wood": 14978, "marble": 11257},
        {"wood": 17424, "marble": 13113},
        {"wood": 20263, "marble": 15267},
        {"wood": 23555, "marble": 17765},
        {"wood": 27374, "marble": 20663},
        {"wood": 31805, "marble": 24025},
        {"wood": 36944, "marble": 27924},
        {"wood": 42905, "marble": 32448}
    ],

    "fireworker": [
        {"wood": 273, "marble": 135},
        {"wood": 353, "marble": 212},
        {"wood": 445, "marble": 302},
        {"wood": 551, "marble": 405},
        {"wood": 673, "marble": 526},
        {"wood": 813, "marble": 665},
        {"wood": 974, "marble": 827},
        {"wood": 1159, "marble": 1015},
        {"wood": 1373, "marble": 1233},
        {"wood": 1618, "marble": 1486},
        {"wood": 1899, "marble": 1779},
        {"wood": 2223, "marble": 2120},
        {"wood": 2596, "marble": 2514},
        {"wood": 3025, "marble": 2972},
        {"wood": 3517, "marble": 3503},
        {"wood": 4084, "marble": 4119},
        {"wood": 4736, "marble": 4834},
        {"wood": 5486, "marble": 5662},
        {"wood": 6347, "marble": 6624},
        {"wood": 7339, "marble": 7739},
        {"wood": 8479, "marble": 9033},
        {"wood": 9790, "marble": 10534},
        {"wood": 11297, "marble": 12275},
        {"wood": 13031, "marble": 14294},
        {"wood": 15025, "marble": 16637},
        {"wood": 17318, "marble": 19354},
        {"wood": 19955, "marble": 22507},
        {"wood": 22987, "marble": 26163},
        {"wood": 26474, "marble": 30405},
        {"wood": 30484, "marble": 35325},
        {"wood": 35096, "marble": 41033},
        {"wood": 40400, "marble": 47653}
    ],

    "vineyard": [
        {"wood": 339, "marble": 123},
        {"wood": 423, "marble": 198},
        {"wood": 520, "marble": 285},
        {"wood": 631, "marble": 387},
        {"wood": 758, "marble": 504},
        {"wood": 905, "marble": 640},
        {"wood": 1074, "marble": 798},
        {"wood": 1269, "marble": 981},
        {"wood": 1492, "marble": 1194},
        {"wood": 1749, "marble": 1440},
        {"wood": 2045, "marble": 1726},
        {"wood": 2384, "marble": 2058},
        {"wood": 2775, "marble": 2443},
        {"wood": 3225, "marble": 2889},
        {"wood": 3741, "marble": 3407},
        {"wood": 4336, "marble": 4008},
        {"wood": 5019, "marble": 4705},
        {"wood": 5805, "marble": 5513},
        {"wood": 6709, "marble": 6450},
        {"wood": 7749, "marble": 7538},
        {"wood": 8944, "marble": 8800},
        {"wood": 10319, "marble": 10263},
        {"wood": 11900, "marble": 11961},
        {"wood": 13718, "marble": 13930},
        {"wood": 15809, "marble": 16214},
        {"wood": 18214, "marble": 18864},
        {"wood": 20979, "marble": 21938},
        {"wood": 24159, "marble": 25503},
        {"wood": 27816, "marble": 29639},
        {"wood": 32021, "marble": 34437},
        {"wood": 36858, "marble": 40002},
        {"wood": 42419, "marble": 46458}
    ],

    "architect": [
        {"wood": 185, "marble": 106},
        {"wood": 291, "marble": 160},
        {"wood": 413, "marble": 222},
        {"wood": 555, "marble": 295},
        {"wood": 720, "marble": 379},
        {"wood": 911, "marble": 475},
        {"wood": 1133, "marble": 587},
        {"wood": 1390, "marble": 716},
        {"wood": 1689, "marble": 865},
        {"wood": 2035, "marble": 1036},
        {"wood": 2437, "marble": 1233},
        {"wood": 2902, "marble": 1460},
        {"wood": 3443, "marble": 1722},
        {"wood": 4070, "marble": 2023},
        {"wood": 4797, "marble": 2369},
        {"wood": 5640, "marble": 2767},
        {"wood": 6619, "marble": 3226},
        {"wood": 7754, "marble": 3753},
        {"wood": 9070, "marble": 4359},
        {"wood": 10598, "marble": 5056},
        {"wood": 12369, "marble": 5857},
        {"wood": 14424, "marble": 6778},
        {"wood": 16808, "marble": 7836},
        {"wood": 19573, "marble": 9052},
        {"wood": 22781, "marble": 10449},
        {"wood": 26502, "marble": 12055},
        {"wood": 30818, "marble": 13899},
        {"wood": 35825, "marble": 16017},
        {"wood": 41633, "marble": 18451},
        {"wood": 48371, "marble": 21246},
        {"wood": 56186, "marble": 24455},
        {"wood": 65252, "marble": 28141}
    ],

    "temple": [
        {"wood": 216, "glass": 173},
        {"wood": 228, "glass": 190},
        {"wood": 333, "glass": 290},
        {"wood": 465, "glass": 423},
        {"wood": 598, "glass": 567},
        {"wood": 760, "glass": 752},
        {"wood": 958, "glass": 989},
        {"wood": 1197, "glass": 1290},
        {"wood": 1432, "glass": 1610},
        {"wood": 1773, "glass": 2080},
        {"wood": 2112, "glass": 2586},
        {"wood": 2512, "glass": 3210},
        {"wood": 3082, "glass": 4109},
        {"wood": 3655, "glass": 5084},
        {"wood": 4458, "glass": 6471},
        {"wood": 5126, "glass": 7765},
        {"wood": 6232, "glass": 9851},
        {"wood": 7167, "glass": 11821},
        {"wood": 8688, "glass": 14952},
        {"wood": 10247, "glass": 18402},
        {"wood": 11784, "glass": 22082},
        {"wood": 14229, "glass": 27824},
        {"wood": 16753, "glass": 34184},
        {"wood": 19266, "glass": 41020},
        {"wood": 23186, "glass": 51514},
        {"wood": 26664, "glass": 61817},
        {"wood": 32027, "glass": 77477},
        {"wood": 36831, "glass": 92972},
        {"wood": 43257, "glass": 113941},
        {"wood": 50782, "glass": 139577},
        {"wood": 59591, "glass": 170911},
        {"wood": 68529, "glass": 205093},
        {"wood": 80385, "glass": 251034},
        {"wood": 96068, "glass": 313054},
        {"wood": 108393, "glass": 368577},
        {"wood": 129447, "glass": 459304},
        {"wood": 148864, "glass": 551164},
        {"wood": 174363, "glass": 673645}
    ],

    "dump": [
        {"wood": 640, "marble": 497, "glass": 701, "sulfur": 384},
        {"wood": 1152, "marble": 932, "glass": 1146, "sulfur": 845},
        {"wood": 1766, "marble": 1445, "glass": 1668, "sulfur": 1398},
        {"wood": 2504, "marble": 2051, "glass": 2278, "sulfur": 2061},
        {"wood": 3388, "marble": 2762, "glass": 2991, "sulfur": 2858},
        {"wood": 4450, "marble": 3609, "glass": 3526, "sulfur": 3813},
        {"wood": 5724, "marble": 4604, "glass": 4803, "sulfur": 4960},
        {"wood": 7253, "marble": 5778, "glass": 5946, "sulfur": 6336},
        {"wood": 9088, "marble": 7164, "glass": 7283, "sulfur": 7987},
        {"wood": 11289, "marble": 8799, "glass": 8847, "sulfur": 9968},
        {"wood": 13931, "marble": 10728, "glass": 10678, "sulfur": 12346},
        {"wood": 17101, "marble": 13005, "glass": 12819, "sulfur": 15199},
        {"wood": 20905, "marble": 15691, "glass": 15325, "sulfur": 18623},
        {"wood": 25470, "marble": 18862, "glass": 18257, "sulfur": 22731},
        {"wood": 30948, "marble": 22602, "glass": 21687, "sulfur": 27661},
        {"wood": 37522, "marble": 27016, "glass": 25700, "sulfur": 33578},
        {"wood": 45410, "marble": 32225, "glass": 30395, "sulfur": 40677},
        {"wood": 54876, "marble": 38371, "glass": 35889, "sulfur": 49197},
        {"wood": 66236, "marble": 45623, "glass": 42316, "sulfur": 59420},
        {"wood": 79867, "marble": 54181, "glass": 49837, "sulfur": 71688},
        {"wood": 96224, "marble": 64279, "glass": 58635, "sulfur": 86410},
        {"wood": 115853, "marble": 76195, "glass": 68930, "sulfur": 104076},
        {"wood": 139408, "marble": 90256, "glass": 80974, "sulfur": 125275},
        {"wood": 167673, "marble": 106847, "glass": 95066, "sulfur": 150714},
        {"wood": 201592, "marble": 126425, "glass": 111554, "sulfur": 181241},
        {"wood": 242294, "marble": 149528, "glass": 130844, "sulfur": 217873},
        {"wood": 291137, "marble": 176788, "glass": 153414, "sulfur": 261831},
        {"wood": 349749, "marble": 208956, "glass": 179821, "sulfur": 314582},
        {"wood": 420082, "marble": 246913, "glass": 201717, "sulfur": 377882},
        {"wood": 504483, "marble": 291703, "glass": 246865, "sulfur": 453843},
        {"wood": 605763, "marble": 344555, "glass": 289158, "sulfur": 544995},
        {"wood": 727300, "marble": 406921, "glass": 338642, "sulfur": 654378},
        {"wood": 873144, "marble": 480512, "glass": 396537, "sulfur": 785638},
        {"wood": 1048157, "marble": 567350, "glass": 464275, "sulfur": 943149},
        {"wood": 1258172, "marble": 669818, "glass": 543528, "sulfur": 1132163},
        {"wood": 1510191, "marble": 790731, "glass": 636254, "sulfur": 1358980},
        {"wood": 1812613, "marble": 933409, "glass": 744743, "sulfur": 1631160},
        {"wood": 2175519, "marble": 1101768, "glass": 871676, "sulfur": 1957775},
        {"wood": 2611007, "marble": 1300432, "glass": 1020188, "sulfur": 2349715},
        {"wood": 3133593, "marble": 1534855, "glass": 1193946, "sulfur": 2820041}
    ],

    "pirateFortress": [
        {"wood": 450, "marble": 250},
        {"wood": 906, "marble": 505},
        {"wood": 1389, "marble": 783},
        {"wood": 1935, "marble": 1112},
        {"wood": 2593, "marble": 1534},
        {"wood": 3427, "marble": 2103},
        {"wood": 4516, "marble": 2883},
        {"wood": 5950, "marble": 3949},
        {"wood": 7834, "marble": 5388},
        {"wood": 10284, "marble": 7296},
        {"wood": 13430, "marble": 9782},
        {"wood": 17415, "marble": 12964},
        {"wood": 22394, "marble": 16970},
        {"wood": 28534, "marble": 21938},
        {"wood": 36015, "marble": 28019},
        {"wood": 45029, "marble": 35370},
        {"wood": 55779, "marble": 44162},
        {"wood": 68482, "marble": 54573},
        {"wood": 83366, "marble": 66793},
        {"wood": 100671, "marble": 81020},
        {"wood": 120648, "marble": 97463},
        {"wood": 143562, "marble": 116341},
        {"wood": 169686, "marble": 137883},
        {"wood": 199309, "marble": 162325},
        {"wood": 232729, "marble": 189915},
        {"wood": 270255, "marble": 220912},
        {"wood": 312210, "marble": 255580},
        {"wood": 358926, "marble": 294197},
        {"wood": 410748, "marble": 337048},
        {"wood": 468032, "marble": 384429}
    ],

    "blackMarket": [
        {"wood": 440, "marble": 260},
        {"wood": 887, "marble": 525},
        {"wood": 1360, "marble": 807},
        {"wood": 1890, "marble": 1126},
        {"wood": 2516, "marble": 1509},
        {"wood": 3288, "marble": 1988},
        {"wood": 4263, "marble": 2601},
        {"wood": 5505, "marble": 3390},
        {"wood": 7086, "marble": 4403},
        {"wood": 9086, "marble": 5693},
        {"wood": 11590, "marble": 7315},
        {"wood": 14691, "marble": 9331},
        {"wood": 18489, "marble": 11807},
        {"wood": 23088, "marble": 14812},
        {"wood": 28600, "marble": 18420},
        {"wood": 35143, "marble": 22708},
        {"wood": 42839, "marble": 27757},
        {"wood": 51820, "marble": 33654},
        {"wood": 62218, "marble": 40486},
        {"wood": 74175, "marble": 48348},
        {"wood": 87838, "marble": 57334},
        {"wood": 103356, "marble": 67546},
        {"wood": 120888, "marble": 79087},
        {"wood": 140596, "marble": 92064},
        {"wood": 162647, "marble": 106587}
    ],

    "marineChartArchive":   [
        {"wood": 578, "marble": 346, "glass": 161},
        {"wood": 1298, "marble": 1066, "glass": 611},
        {"wood": 2133, "marble": 1916, "glass": 1142},
        {"wood": 3102, "marble": 2918, "glass": 1769},
        {"wood": 4226, "marble": 4101, "glass": 2508},
        {"wood": 5530, "marble": 5497, "glass": 3380},
        {"wood": 7042, "marble": 7144, "glass": 4410},
        {"wood": 8796, "marble": 9088, "glass": 5625},
        {"wood": 10831, "marble": 11381, "glass": 7058},
        {"wood": 13191, "marble": 14088, "glass": 8750},
        {"wood": 15929, "marble": 17281, "glass": 10746},
        {"wood": 19106, "marble": 21050, "glass": 13101},
        {"wood": 22790, "marble": 25496, "glass": 15880},
        {"wood": 27064, "marble": 30743, "glass": 19159},
        {"wood": 32022, "marble": 36935, "glass": 23029},
        {"wood": 37773, "marble": 44241, "glass": 27595},
        {"wood": 44444, "marble": 52862, "glass": 32984},
        {"wood": 52183, "marble": 63035, "glass": 39342},
        {"wood": 61159, "marble": 75039, "glass": 46844},
        {"wood": 71572, "marble": 89204, "glass": 55697},
        {"wood": 83651, "marble": 105918, "glass": 66144},
        {"wood": 97663, "marble": 125641, "glass": 78470},
        {"wood": 113917, "marble": 148914, "glass": 93016},
        {"wood": 132771, "marble": 176377, "glass": 110180},
        {"wood": 154642, "marble": 208782, "glass": 130434},
        {"wood": 180012, "marble": 247021, "glass": 154333},
        {"wood": 209442, "marble": 292142, "glass": 182533},
        {"wood": 243580, "marble": 345385, "glass": 215810},
        {"wood": 283180, "marble": 408212, "glass": 255077},
        {"wood": 329116, "marble": 482348, "glass": 301412},
        {"wood": 382402, "marble": 569829, "glass": 356088},
        {"wood": 444214, "marble": 673055, "glass": 420604},
        {"wood": 515916, "marble": 794863, "glass": 496734},
        {"wood": 599090, "marble": 938596, "glass": 586567},
        {"wood": 695572, "marble": 1108201, "glass": 692571},
        {"wood": 807491, "marble": 1308335, "glass": 817654},
        {"wood": 937317, "marble": 1544493, "glass": 965253},
        {"wood": 1087916, "marble": 1823160, "glass": 1139420},
        {"wood": 1262610, "marble": 2151986, "glass": 1344936},
        {"wood": 1465255, "marble": 2540001, "glass": 1587446}
    ]
};

const IMAGES = {
    "resources": { // if adding here smth - add it to if in "_common.js" line 125
        "all": Utils.generateDomain() + "/skin/wonder/multi_wine.png",
        "marble": Utils.generateDomain() + "/skin/resources/icon_marble.png",
        "glass": Utils.generateDomain() + "/skin/resources/icon_glass.png",
        "sulfur": Utils.generateDomain() + "/skin/resources/icon_sulfur.png",
        "wine": Utils.generateDomain() + "/skin/resources/icon_wine.png",
        "wood": Utils.generateDomain() + "/skin/resources/icon_wood.png",
        "small" : {
            "marble": Utils.generateDomain() + "/skin/resources/icon_marble_small.png",
            "glass": Utils.generateDomain() + "/skin/resources/icon_crystal_small.png",
            "sulfur": Utils.generateDomain() + "/skin/resources/icon_sulfur_small.png",
            "wine": Utils.generateDomain() + "/skin/resources/icon_wine_small.png",
            "wood": Utils.generateDomain() + "/skin/resources/icon_wood_small.png"
        }
    },
    "wonders": {
        1 : Utils.generateDomain() + "/skin/world/w1.png",
        2 : Utils.generateDomain() + "/skin/world/w2.png",
        3 : Utils.generateDomain() + "/skin/world/w3.png",
        4 : Utils.generateDomain() + "/skin/world/w4.png",
        5 : Utils.generateDomain() + "/skin/world/w5.png",
        6 : Utils.generateDomain() + "/skin/world/w6.png",
        7 : Utils.generateDomain() + "/skin/world/w7.png",
        8 : Utils.generateDomain() + "/skin/world/w8.png"
    },
    Pirate:{
        capture: Utils.generateDomain() + "/skin/resources/capturePoints.png"
    }
}; });;
require.toCache('/js/helper/event.js', function(require,module,exports) { 'use strict';

const SPACE = ' ';
const DOT = '.';
const EMPTY_STRING = '';
class EventEmitter {
    constructor() {
        this.handlers = {};
    }

    on(evtStr, callback) {
        const events = evtStr.split(SPACE);
        _.each(events, (event) => {
            let parts = event.split(DOT);
            let baseEvent = parts[0];
            let name = parts[1] || EMPTY_STRING;

            if (!this.handlers[baseEvent]) {
                this.handlers[baseEvent] = [];
            }

            this.handlers[baseEvent].push({
                name: name,
                callback: callback
            });
        });

        return true;
    }

    off(evtStr) {
        if (!evtStr) {
            return;
        }

        const events = evtStr.split(SPACE);
        _.each(events, (event) => {
            let parts = event.split(DOT);
            let baseEvent = parts[0];
            let name = parts[1] || EMPTY_STRING;

            if (baseEvent) {
                this._off(baseEvent, name);
            } else {
                for (let t in this.handlers) {
                    this._off(t, name);
                }
            }
        });
    }

    _off(baseEvent, name) {
        let handlers = this.handlers[baseEvent] || [];
        let len = handlers.length;

        for(let i = 0; i < handlers.length; i++) {
            let event = handlers[i];
            if ((!name) || (event.name === name)) {
                handlers.splice(i, 1);

                if (handlers.length === 0) {
                    delete this.handlers[baseEvent];
                    break;
                }

                i--;
            }
        }
    }

    removeAllListeners(event) {
        this.handlers[event] = [];
        return true;
    }

    resetAllListeners() {
        this.handlers = [];
    }

    emit(event, args = []) {
        if (!this.handlers[event]) {
            return;
        }

        _.each(this.handlers[event], (ev) => {
            if (ev) {
                ev.callback.apply(this, args);
            }
        });
    }
}

module.exports = EventEmitter; });;
require.toCache('/js/helper/httpClient.js', function(require,module,exports) { 'use strict';
const universalify = require("./universalify.js");
class HttpClient {
    constructor(){
    }

    httpNotify(url, type, result){
        window.postMessage({
            type: 'FROM_IKAEASY_V3',
            cmd: 'ajax',
            request: {
                type: type,
                data: result,
                url: url
            }
        });
    }

    ikariamPrms(path, params) {
        return new Promise(resolve => {
            params.actionRequest = Front.data.actionRequest;
            params.ajax = 1;

            let url = `${path}?${$.param(params)}`;

            let cb = (result) => {
                this.httpNotify(url, 'get', result);
                resolve(result);
            };

            $.ajax({
                url: url,
                async: true,
                dataType: "json",
                error: cb,
                success: cb
            });
        })
    }
    ikariam = universalify.fromPromise(this.ikariamPrms);
}

module.exports = new HttpClient(); });;
require.toCache('/js/helper/ikalogs.js', function(require,module,exports) { 'use strict';

const CNT_ROUND_FOR_PART = 20;
class Ikalogs {
    constructor(avatarId) {
        this._user_id = avatarId;
        this._all_rounds = 0;
        this.make_box();
    }

    render(tpl, data = {}) {
        const templater = require('./templater.js');
        return templater.render(tpl, data)
    }

    make_box() {
        if ($('#ikalogs_saver').length > 0) {
            $('#ikalogs_saver').parent().parent().parent().parent().remove();
        }

        this.$el = Utils.createDynamic(LANGUAGE.getLocalizedString('ikalogs_save_log'), this.render('ikalogs-dynamic.ejs', {}));
        $('#backTo').after(this.$el);

        let url = $('#troopsReport .contentBox01h p.link a').eq(0).attr('href');
        this._rep_id = url.match(/detailedCombatId=(\d+)/i)[1];

        let battles = Utils.getItem('battles') || {};
        if ((typeof battles[this._rep_id] !== 'undefined') && (battles[this._rep_id].ikalogs)) {
            $('#ikalogs_already_exist', this.$el).show();
            $('#ikalogs_already_exist a', this.$el).attr('href', battles[this._rep_id].ikalogs);
        } else {
            $('#ikalogs_already_exist', this.$el).hide();
        }

        this.checkIsAuth();

        $('select[name="report_type"]', this.$el).change(() => {
            $('select[name="report_rounds"]', this.$el).hide();
            $('.ikalogs_between', this.$el).hide();

            switch($('select[name="report_type"]', this.$el).val()) {
                case 'each' :
                    $('select[name="report_rounds"]', this.$el).show();
                    break;

                case "between" :
                    $('.ikalogs_between', this.$el).show();
                    break;
            }
        });

        $('a.button', this.$el).click((e) => {
            e.preventDefault();
            this.analize();
        });
    }

    analize() {
        this._rounds = [];
        this._short = null;
        this._full = {};
        this._users_ally = {};

        let reportType = $('select[name="report_type"]', this.$el).val();
        $('.ikalogs_result, .ikalogs_block', this.$el).hide();
        $('.ikalogs_loader', this.$el).show();
        $('.ikalogs_loader span', this.$el).text(LANGUAGE.getLocalizedString('ikalogs_get_info'));

        if (reportType === 'between') {
            let _rounds = $('.ikalogs_between input', this.$el).val().trim();
            if (!_rounds) {
                $('select[name="report_type"]', this.$el).val('short');
                reportType = 'short';
            }

            _rounds = _rounds.replace(/\s/g, '').split(',');
            _.each(_rounds, (v) => {
                if (/^\d+$/.test(v)) {
                    this._rounds.push(parseInt(v));
                } else if(/^\d+-\d+$/.test(v)) {
                    let t = v.split('-');
                    if (parseInt(t[0]) < parseInt(t[1])) {
                        this.updateRounds(t[0], t[1]);
                    } else if (t[0] > t[1]) {
                        this.updateRounds(t[1], t[0]);
                    } else {
                        this._rounds.push(parseInt(t[0]));
                    }
                }
            });

            if(this._rounds.length === 0) {
                $('select[name="report_type"]', this.$el).val('short');
                reportType = 'short';
            } else {
                this._rounds = _.uniq(this._rounds);
                this._rounds = this._rounds.sort(function(a, b) {
                    return a - b;
                });
            }
        }

        let count = 2;
        let _afterAll = () => {
           if (--count === 0) {
               this.isComplete();
           }
        };

        let $troopsReport = $('#troopsReport');

        // Получаем краткий доклад
        this.getShortLog(_afterAll);

        $.get('/index.php?view=highscore&showMe=1&ajax=1', (data) => {
            data = data[1][1][1];
            let t = data.match(/<tr class="(.*?\s)?own(\s.*?)?">[\s\S]*?<td class="name">([^<]+)<\/td>[\s\S]*?<td class="allytag">([\s\S]*?)<\/td>/);
            if (t) {
                this._users_ally[t[3].trim()] = t[4].replace(/(<[^>]+>)/g, '').trim();
            }

            _afterAll();
        }, 'json');


        if (reportType !== 'short') {
            $('.ikalogs_loader span', this.$el).text(LANGUAGE.getLocalizedString('ikalogs_get_rounds'));
            count++;
            this.getDetailRound($troopsReport.find('.contentBox01h p.link a').eq(0).attr('href').match(/combatRound=(\d+)/i)[1], (rep, data) => {
                if (!rep) {
                    _afterAll();
                    return;
                }

                this._all_rounds = Utils.getInt(rep.match(/\d+ \/ (\d+)<\//i)[1]);

                switch (reportType) {
                    case 'each' :
                        this.getRoundList(parseInt($('select[name="report_rounds"]', this.$el).val()));
                        break;

                    case "full" :
                        this.getRoundList(1);
                        break;

                    case "last" :
                        this._rounds = [ this._all_rounds ];
                        break;
                }

                if (this._rounds[0] === 1) {
                    this.setFullRound(rep);
                }
                

                let queue = [].concat(this._rounds);
                let $ikalogsProgress = $('.ikalogs_loader_progress div', this.$el);
                let queryFunc = () => {
                    if (!queue.length) {
                        return;
                    }

                    let r_id = queue.shift();
                    count++;
                    this.getDetailRound(r_id, (rep, data) => {
                        if (rep) {
                            this.setFullRound(rep);
                        }

                        queryFunc();
                        _afterAll();

                        $($ikalogsProgress).width((100 - ((queue.length * 100) / this._rounds.length)) + '%');
                    });
                };

                for (let i = 0; i < 5; i++) {
                    queryFunc();
                }

                _afterAll();
            });
        }
    }

    isComplete() {
        $('.ikalogs_loader span', this.$el).text(LANGUAGE.getLocalizedString('ikalogs_saving'));
        this.sendReport();
    }

    sendReport() {
        let version = $('#GF_toolbar .version').text().replace(/[^\d.]+/g, '').split('.');
        if (version.length === 3) { version.push('0'); }

        let obj = {
            'short'    : this._short,
            'server'   : Utils.getServerDomain(),
            'world'    : Utils.getServerWorld().substring(1),
            'rounds'   : this._rounds,
            'max'      : this._all_rounds,
            'ally'     : this._users_ally,
            'rep_id'   : this._rep_id,
            'version'  : parseInt(version.join('')),
            'user'     : this._user_id,
            'finished' : 0
        };

        $('.ikalogs_loader_progress div', this.$el).width('0%');
        if(this._rounds.length > CNT_ROUND_FOR_PART) {
            this.sendPartLogs(obj, 0);
        } else {
            obj.full = this._full;
            obj.finished = 1;
            this.sendRequest(obj);
        }
    }

    getDetailRound(combatRound, callback) {
        $.get(`?view=militaryAdvisorDetailedReportView&combatRound=${combatRound}&detailedCombatId=${this._rep_id}&ajax=1`, (data) => {
            data = data[1][1][1];
            let matches = data.match(/id="mainview"([\s\S]*?)$/i);
            let result = (matches) ? ((matches.length === 2) ? matches[1] : matches[0]) : '';
            callback(result, data);
        }, 'json');
    }

    getShortLog(callback) {
        $.get(`?view=militaryAdvisorReportView&combatId=${this._rep_id}&ajax=1`, (data) => {
            data = data[1][1][1];
            this._short = data.match(/<div id="militaryAdvisorReportView">([\s\S]*?)$/)[1];
            callback();
        }, 'json');
    }

    sendPartLogs(obj, start, id) {
        $('.ikalogs_loader_progress div', this.$el).width((start * 100 / this._rounds.length) + '%');
        obj.full = {};

        if ((id) && (start > 0)) {
            obj.id = id;
        }

        if (start < obj.rounds.length) {
            if (start === CNT_ROUND_FOR_PART) {
                obj.short = 'incomplete';
            }

            for(let j = 1; j <= CNT_ROUND_FOR_PART; j++) {
                obj.full[obj.rounds[obj.rounds.length - (start + j)]] = this._full[obj.rounds[obj.rounds.length - (start + j)]];
            }
        } else {
            obj.finished = 1;
            this.sendRequest(obj);

            return;
        }

        this.sendRequest(obj, (data) => {
            if ((data) && (data.status === 'ok') && (data.rep_id)) {
                this.sendPartLogs(obj, start + CNT_ROUND_FOR_PART, data.rep_id);
            } else {
                this.showFailed(data);
            }
        });
    }

    sendRequest(vars, callback) {
        chrome.runtime.sendMessage({ cmd: 'ajax', url: 'common/import/', method: 'post', body: vars }, (data) => {
            if (!data.status) {
                data = {'status': 'failed'};
            }

            if (!callback) {
                this.getResponse(data);
            } else {
                callback(data);
            }
        });
    }

    getResponse(data) {
        $('.ikalogs_block', this.$el).hide();
        $('.ikalogs_loader', this.$el).hide();
        $('.ikalogs_result', this.$el).show();

        if ((data) && (data.status === 'ok')) {
            $('.ikalogs_result span', this.$el).removeClass('ikalogs_failed').text(LANGUAGE.getLocalizedString('ikalogs_saving_success'));
            $('.ikalogs_result a', this.$el).off('click').text(LANGUAGE.getLocalizedString('ikalogs_open_report')).attr('href', data.url);

            let battles = Utils.getItem('battles') || {};
            battles[this._rep_id] = {
                ikalogs: data.url,
                date: _.trim($('#troopsReport h3.header .date').text().trim(), '()')
            };

            Utils.setItem('battles', battles);
        } else {
            this.showFailed(data);
        }
    }

    updateRounds(a, b) {
        a = parseInt(a);
        b = parseInt(b);
        for(let i = a; i <= b; i++) {
            this._rounds.push(i);
        }
    }

    getRoundList(step) {
        for(let i = 1; i <= this._all_rounds; i += step) {
            this._rounds.push(i);
        }
    }

    setFullRound(data) {
        let rounds = data.match(/(\d+) \/ (\d+)<\//i);

        if (rounds.length === 3) {
            let round = parseInt(rounds[1]);
            if (this._rounds.indexOf(round) > -1) {
                this._full[round] = data;
            }
        }
    }

    checkIsAuth() {
        const ikalogsRu = require('./ikalogsRu.js');
        ikalogsRu.checkIsAuth((email) => {
            if (email) {
                $('#ikalogs_auth').text(email);
            } else {
                $('#ikalogs_auth').html(`<a href="https://ikalogs.ru" target="__blank" class="ikalogs_not_logged">${LANGUAGE.getLocalizedString('ikalogs_not_logged')}</a>`);
            }
        });
    }

    showFailed(data) {
        console.error('Ikalogs ErrorNo:', data.errorNo);

        $('.ikalogs_result span', this.$el).addClass('ikalogs_failed').html(LANGUAGE.getLocalizedString('ikalogs_saving_failed'));
        $('.ikalogs_result a', this.$el).text(LANGUAGE.getLocalizedString('ikalogs_repeat')).one('click', this.repeat.bind(this));
    }

    repeat(e) {
        e.preventDefault();
        this.analize();
    }
}

module.exports = Ikalogs; });;
require.toCache('/js/helper/ikalogsRu.js', function(require,module,exports) { 'use strict';

const Event = require('./event.js');
class IkalogsRu extends Event {
    constructor() {
        super();

        this.email = null;
        this.checkIsAuth();

        setTimeout(() => {
            this.checkIsAuth();
        }, 300000);
    }

    checkIsAuth(callback) {
        let setEmail = (email) => {
            if (email !== this.email) {
                this.email = email;
                this.emit('online', [email !== null]);
            }
        };

        chrome.runtime.sendMessage({ cmd: 'ajax', url: 'layout/user/isAuth/' }, (data) => {
            if (data && data.auth && data.email) {
                setEmail(data.email);
                callback && callback(data.email);
            } else {
                setEmail(null);
                callback && callback(null);
            }
        });
    }

    sendWorld(body) {
        chrome.runtime.sendMessage({ cmd: 'ajax', url: 'common/world/', method: 'post', body: body });
    }

    sendWorldEmptyIslands(islands) {
        chrome.runtime.sendMessage({ cmd: 'ajax', url: 'common/world/empty', method: 'post', body: {
                server: Utils.getServerDomain(),
                world: Utils.getServerWorld().substring(1),
                islands: islands.join(','),
            }
        });
    }

    getMines(callback) {
        let server = Utils.getServerDomain();
        let world = Utils.getServerWorld().substring(1);

        chrome.runtime.sendMessage({ cmd: 'ajax', url: `common/world/mines?server=${server}&world=${world}` }, callback);
    }

    getBattleInfo(battleId) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(
                { cmd: 'ajax', url: `user/report/get/?id=${battleId}`, headers: { e: true } }, 
                response => resolve(response)
            )
        });
    }
}

module.exports = new IkalogsRu(); });;
require.toCache('/js/helper/marker.js', function(require,module,exports) { 'use strict';

class Marker {
    constructor() {
        this.colors = Object.freeze(['orange', 'bordo', 'pink', 'purple', 'turquoise', 'black', 'white']);
        this.name = Utils.getItem('marker') || {};
    }

    setColor(name, color, ally = false) {
        name = name.trim();
        name += ally ? '_ally' : '';

        if (this.colors.indexOf(color) === -1) {
            console.error('Unknown color', color);
            return;
        }

        _.each(this.name, (v, color) => {
            if (v.indexOf(name) > -1) {
                this.name[color] = _.without(v, name);
            }
        });

        if (typeof this.name[color] === 'undefined') {
            this.name[color] = [];
        }

        this.name[color].push(name);
        Utils.setItem('marker', this.name);
    }

    deleteName(name) {
        name = name.trim();

        _.each(this.name, (v, color) => {
            this.name[color] = _.filter(v, (a) => {
                return a.trim() !== name;
            });
        });
        Utils.setItem('marker', this.name);

        return true;
    }
}

module.exports = new Marker(); });;
require.toCache('/js/helper/notification.js', function(require,module,exports) { 'use strict';

class Notif {
    constructor() {
        this.checkPermission();
        this.advisers.init();
    }

    checkPermission() {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    }


}

module.exports = new Notif(); });;
require.toCache('/js/helper/options.js', function(require,module,exports) { 'use strict';

class Options {
    constructor() {
        this.list = require('../../options.json');
    }

    get(name) {
        if (!Front.ikaeasyData.options) {
            Front.ikaeasyData.options = {};
            Front.ikaeasyData.save();
        }

        if (typeof Front.ikaeasyData.options[name] !== 'undefined') {
            return Front.ikaeasyData.options[name];
        }

        if (typeof this.list[name] === 'undefined') {
            return true;
        }

        return this.list[name];
    }

    set(name, value) {
        Front.ikaeasyData.options[name] = value;
        Front.ikaeasyData.save();
    }

    getList() {
        return {
            'IkaEasy': [
                'island_ap',
                'island_ships_owner',
                'island_details',
                'world_search_island',
                'city_details',
                'city_building_tooltip',
                'dummy_resource_prod',
                'dummy_transporter',
                'units_max',
                'diplomacy_links',
                'diplomacy_tab_members',
                'military_movements',
                'transport_buttons',
                'auto_accept_daily_bonus',
                'prevent_accidental_colony_destruction',
                'empire',
                'notes',
                'city_hotkeys',
                'quick_menu',
            ],

            'option._ads': [
                'hide_premium',
                'hide_ads',
                'hide_happy_hour',
                'hide_friends_bar'
            ],

            'option._notification': [
                'notification_wait_no_interaction',
                'notification_building_complete',
                'notification_building_complete_prevent',
                'notification_recruiting_complete',
                'notification_transport_loading',
                'notification_transport_en_route',
                'notification_transport_returning',
                'notification_advisor'
            ]
        };
    }

    hasHint(key) {
        let k = `option.${key}_hint`;
        return !!LANGUAGE[k];
    }

}

module.exports = new Options(); });;
require.toCache('/js/helper/storage.js', function(require,module,exports) { 'use strict';

const Events = require('./event.js');
const universalify = require("./universalify.js");
class Storage extends Events {
    cache = {};
    constructor() {
        super();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            _.each(changes, (val, key) => {
                if (val.oldValue) {
                    val.oldValue = JSON.parse(val.oldValue);
                }

                if (val.newValue) {
                    val.newValue = JSON.parse(val.newValue);
                }

                this.emit(key, [val, key, namespace]);
            });
        });
    }

    on(key, callback) {
        return super.on(Utils.getThisKey(key), callback);
    }

    off(key) {
        return super.off(Utils.getThisKey(key));
    }

    getPrms(key) {
        return new Promise(resolve => {
            key = Utils.getThisKey(key);
            if(key in this.cache){
                return resolve(this.cache[key]);
            }

            chrome.storage.local.get(key, (result) => {
                let val = result[key] || null;
                if (val) {
                    val = JSON.parse(val);
                }
                this.cache[key] = val;
                resolve(val, null);
            });
        })
    }
    get = universalify.fromPromise(this.getPrms);

    setPrms(key, value) {
        return new Promise(resolve => {
            const _key = Utils.getThisKey(key);
            let data = {};
            data[_key] = JSON.stringify(value);

            try {
                chrome.storage.local.set(data, () => {
                    resolve(true);
                    this.cache[_key] = value;
                });
            } catch (e) {
                console.error(e, data);
                resolve(false);
            }
        })
    }
    set = universalify.fromPromise(this.setPrms);
}

module.exports = new Storage();
 });;
require.toCache('/js/helper/support.js', function(require,module,exports) { 'use strict';

class Support {

    show() {
        if ($('#ikaeasy-support-win').length) {
            return;
        }

        const winClass = require('./win.js');
        let win = new winClass({
            title: 'IkaEasy',
            subtitle: LANGUAGE.getLocalizedString('support_text'),
        });

        const templater = require('./templater.js');
        this.$el = $(templater.render('helper-support.ejs', {}));
        win.getContent().empty().append(this.$el);

        let $textarea = this.$el.find('textarea');
        this.$el.keydown((e) => {
            if ([8, 37, 38, 39, 40, 46].indexOf(e.keyCode) > -1) {
                return true;
            }

            let len = $textarea.val().length;
            if (len >= 4000) {
                e.preventDefault();
            }
        });

        let $issueType = this.$el.find('select[name="issueType"]');
        const $agreeCheck = this.$el.find('input[name="agreeCheck"]');

        $issueType.change(() => {
            let isBug = $issueType.val() === 'Bug';
            this.$el.find('input[name="issueDetails"]').closest('div').toggleClass('ikaeasy-disabled-div', !isBug);
            $('#issueDetails').prop('checked', isBug).prop('disabled', !isBug);

            if (!isBug) {
                this.$el.find('button').prop('disabled', false);
                $agreeCheck.closest('div').prop('hidden', true);
            } else {
                $agreeCheck.closest('div').prop('hidden', false);
                this.$el.find('button').prop('disabled', !$agreeCheck.prop('checked'));
            }
        });

        $agreeCheck.change(() => {
            if ($agreeCheck.prop('checked')) {
                this.$el.find('button').prop('disabled', false);
            } else {
                this.$el.find('button').prop('disabled', true);
            }
        });

        this.$el.find('button').click((e) => {
            e.preventDefault();
            let $input = this.$el.find('input[name="issueTitle"]');
            let type = $issueType.val();
            let title = $input.val().trim();
            let email = this.$el.find('input[name="issueEmail"]').val().trim();
            let desc = $textarea.val().trim();
            let details = ((type === 'Bug') && (this.$el.find('input[name="issueDetails"]').prop('checked')));

            if ((!email) && (type === 'Bug')) {
                if (!confirm(LANGUAGE.getLocalizedString('support_confirm_email'))) {
                    return;
                }
            }

            if (!title) {
                $input.focus();
                return;
            }

            if (!desc) {
                $textarea.focus();
                return;
            }

            let cityId = (Front.data.city) ? Front.data.city.id : Front.data.cities.selectedCityId;
            let body = templater.render('helper-support-email.ejs', {text: desc, cityId: cityId, email: email, details: details});

            win.remove();
            chrome.runtime.sendMessage({ cmd: 'ajax', url: 'default/index/ikaeasy', method: 'post', body: {title: title, desc: body, type: type} }, (data) => {
                Utils.execute_js(`BubbleTips.bindBubbleTip(1, 10, "${LANGUAGE.getLocalizedString('support_sent_success')}")`);
            });
        });
    }
}

module.exports = new Support(); });;
require.toCache('/js/helper/templater.js', function(require,module,exports) { 'use strict';

class Templater {
    constructor() {
        this._compilled = {};
        this._loading = {};
        this._prefix = '/tpl/';
        this._revision = '1';
    }

    preload(path, callback) {
        this.prepare(path, callback);
    }

    prepare(path, callback) {
        if (this._compilled[path]) {
            callback && callback();
            return;
        }

        if (this._loading[path]) {
            callback && this._loading[path].push(callback);
            return;
        }

        this._loading[path] = [];
        callback && this._loading[path].push(callback);

        const url = [this._prefix, path, '?', this._revision].join('');
        getText(url, (text) => {
            this._compilled[path] = _.template(text);

            _.each(this._loading[path], (v) => {
                if (typeof v === 'function') {
                    v();
                }
            });

            delete this._loading[path];
        }, true);
    }

    render(path, data, callback) {
        if (typeof data === 'function') {
            callback = data;
            data = {};
        }

        if (!this._compilled[path]) {
            if (typeof callback === 'function') {
                let cb = () => {
                    this.render(path, data, callback);
                };

                if (this._loading[path]) {
                    this._loading[path].push(cb);
                } else {
                    this.prepare(path, cb);
                }

                return;
            }

            const url = [this._prefix, path, '?', this._revision].join('');
            getText(url, (text) => {
                this._compilled[path] = _.template(text);
            }, false);
        }

        let q = {
            data    : data || {},
            include : this.render.bind(this),
            lget    : LANGUAGE.getLocalizedString,
            num     : Utils.formatNumber,
            url     : chrome.extension.getURL,
            options : require('./options.js')
        };
        
        if (this._compilled[path]) {
            const result = this._compilled[path](q);
            if (typeof callback === 'function') {
                callback(result);
            }

            return result;
        }

        if (typeof this._compilled[path] !== 'undefined') {
            return this._compilled[path](q);
        }
    }
}

function getText(url, callback, async) {
    return $.ajax({
        url      : chrome.extension.getURL(url),
        async    : (typeof async === 'undefined') ? true : !!async,
        dataType : "text",
        error    : function(data, result){callback(data, result);},
        success  : function(data, result){callback(data, result);}
    });
}

module.exports = new Templater(); });;
require.toCache('/js/helper/tooltip.js', function(require,module,exports) { 'use strict';

class Tooltip {
    constructor() {
        this.$tooltip = $('<div id="ikaeasy-tooltip"></div>');
        $('body').append(this.$tooltip);
    }

    show(e, $el, html) {
        $el.off('.tooltip');
        $el.on('mouseleave.tooltip', (e) => {
            this.hide();
        });
        $el.on('mousemove.tooltip', (e) => {
            this._updatePosition(e);
        });

        this.$tooltip.show().html( html );
        this._updatePosition(e);
    }

    hide() {
        this.$tooltip.empty().hide();
    }

    _updatePosition(e) {
        let pos = {
            top: e.pageY + 15,
            left: e.pageX + 15
        };

        this.$tooltip.css(pos);


        let rect = this.$tooltip[0].getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
            pos.top = e.pageY - rect.height - 10;
            this.$tooltip.css(pos);
        }

        if (rect.right > window.innerWidth) {
            pos.left = e.pageX - rect.width - 10;
            this.$tooltip.css(pos);
        }
    }
}

module.exports = new Tooltip(); });;
require.toCache('/js/helper/universalify.js', function(require,module,exports) { 'use strict'
//TODO: move to node modules
// https://www.npmjs.com/package/universalify
exports.fromCallback = function (fn) {
  return Object.defineProperty(function (...args) {
    if (typeof args[args.length - 1] === 'function') fn.apply(this, args)
    else {
      return new Promise((resolve, reject) => {
        fn.apply(
          this,
          args.concat([(err, res) => err ? reject(err) : resolve(res)])
        )
      })
    }
  }, 'name', { value: fn.name })
}

exports.fromPromise = function (fn) {
  return Object.defineProperty(function (...args) {
    const cb = args[args.length - 1]
    if (typeof cb !== 'function') return fn.apply(this, args)
    else fn.apply(this, args.slice(0, -1)).then(r => cb(null, r), cb)
  }, 'name', { value: fn.name })
}
 });;
require.toCache('/js/helper/whatnews.js', function(require,module,exports) { 'use strict';

class WhatNews {
    init(version) {
        if (!version) {
            return;
        }

        let options = require('./options.js');
        let storage = require('./storage.js');
        storage.get('whatnews_version', (err, v) => {
            if (v === version) {
                return;
            }

            $.get(chrome.extension.getURL('/whatnews.json'), (res) => {
                if ((res.enabled) && (res.version) && (res.version === version)) {
                    let Win = require('./win.js');
                    let win = new Win({
                        title: LANGUAGE.getLocalizedString('whatnews.title')
                    });

                    try {
                        let lang = (Utils.language === 'ru') ? 'ru' : 'en';
                        let templater = require('./templater.js');
                        let html = templater.render('whatNews.ejs', {
                            text:       res.text[lang],
                            new:        res.new[lang],
                            fixed:      res.fixed[lang],
                            hotfix:     res.hotfix[lang],
                            newOptions: res.options,
                            options:    options,
                            lang:       lang
                        });

                        win.getContent().html(html);
                        win.setToCenter();
                        win.$el.addClass('ikaeasy-whatnews');

                        win.$el.find('input[type="checkbox"]').change((e) => {
                            let $input = $(e.currentTarget);
                            let name = $input.attr('name');

                            options.set(name, $input.prop('checked'));
                        });
                    } catch(e) {
                        win && win.remove();
                    }
                }

                storage.set('whatnews_version', version);
            }, 'json');
        });
    }
}

module.exports = new WhatNews(); });;
require.toCache('/js/helper/win.js', function(require,module,exports) { 'use strict';

let activeWindow = null;

const Event = require('./event.js');
class Win extends Event {
    constructor(data, force = false) {
        super();

        if ((activeWindow) && (!force)) {
            activeWindow.remove();
        }

        $('.templateView .close').click();

        const templater = require('./templater.js');
        this.$el = $(templater.render('helper-win.ejs', data));

        $('#container').append(this.$el);

        this.$el.find('.ikaeasy-window-close').click(() => {
            this.remove();
        });

        Utils.draggable($('.ikaeasy-window-header', this.$el), this.$el);

        $(document).on('keydown.esc', (e) => {
            e.stopPropagation();
            if (e.keyCode === 27) {
                this.remove();
            }
        });

        this.getContent().css('max-height', $('body').height() - 250);

        // Хак нужен чтобы окно сразу не закрывалось если был открыт templateView через ссылку в адресной строке браузера
        if (!force) {
            setTimeout(() => {
                activeWindow = this;
            }, 500);
        }
    }

    setToCenter() {
        let left = $('body').width() / 2 - this.$el.width() / 2;
        this.$el.css('left', left);
    }

    getContent() {
        return this.$el.find('.ikaeasy-window-content');
    }

    remove() {
        $(document).on('.esc');
        this.$el.remove();

        activeWindow = null;
        this.emit('close');
    }

    static removeActiveWindow() {
        if (activeWindow) {
            activeWindow.remove();
        }
    }
}

module.exports = Win; });;
require.toCache('/js/data/city.js', function(require,module,exports) { 'use strict';

const VERSION = 2;
const HttpClient = require("../helper/httpClient.js");
let instances = {};
class City {
    constructor(cityId, manager) {
        if(cityId in instances){//singleton per cityId
            return instances[cityId];
        }
        this._manager = manager;
        this.cityId = parseInt(cityId);
        this.military = new (require('./military.js'))(this);

        this._data = {
            id: cityId,
            resources: {},
            maxResources: {},
            production: {},

            culturalGoods: 0,
            priests: 0,
            tavernWineLevel: 0,
            scientists: 0
        };
        instances[cityId] = this;
    }

    async ajaxUpdate(){
        await HttpClient.ikariam('/', {
            view: 'townHall',
            cityId: this.cityId,
            position: 0,
            backgroundView: 'city',
            currentCityId: this.cityId
        });
    }

    load(data) {
        if ((!data.city) || (!data.military)) {
            return;
        }

        this._data = data.city;
        this.military.load(data.military);

        if (this._data.__version < VERSION) {
            this._updateToCurrentVersion();
            this._data.__version = VERSION;
        }
    }

    get(key) {
        return this._data[key];
    }

    set(key, value) {
        if (['id', 'resources', 'maxResources', 'production'].indexOf(key) > -1) {
            return;
        }

        if (this._data[key] !== value) {
            this._data[key] = value;
            this._manager.save();
        }
    }

    _updateWineSpending(wineSpendings) {
        if (typeof wineSpendings !== "number") {
            wineSpendings = Front.data.wineSpendings;
        }

        this._data.tavernWineLevel = WINE_USE.indexOf(wineSpendings);

        let vineyard = this.getBuildingByType(Buildings.WINE_PRESS);
        if (vineyard) {
            if (this._data.tavernWineLevel > -1) {
                wineSpendings -= Math.floor(wineSpendings * 0.3);
            } else {
                let t = Math.floor(wineSpendings / 0.7) - 1;
                _.each(WINE_USE, (u, i) => {
                    if (u >= t) {
                        this._data.tavernWineLevel = i;
                        return false;
                    }
                });
            }
        }

        this._data.production[Resources.WINE_SPENDING] = wineSpendings;
    }
    get isCapital(){
        return this._data.isCapital;
    }

    update() {
        if (Front.data.city) {
            this._data.isCapital = Front.data.city.isCapital;
            this._data.islandId  = Front.data.city.islandId;
            this._data.buildings = this._getBuilds();
            this._data.name = Front.data.city.name;
            this._data.ownerId = parseInt(Front.data.city.ownerId);
            this._data.ownerName = Front.data.city.ownerName;
        } else if (Front.data.cities[`city_${this.cityId}`]) {
            this._data.name = Front.data.cities[`city_${this.cityId}`].name;
        }

        this._data.maxActionPoints = Front.data.maxActionPoints;

        let islandResource = _.findKey(TradeGoodOrdinals, (v) => { return v === parseInt(Front.data.producedTradegood); });

        this._data.maxResources[Resources.WOOD]   = Front.data.maxResources.resource;
        this._data.maxResources[Resources.WINE]   = Front.data.maxResources[TradeGoodOrdinals.WINE];
        this._data.maxResources[Resources.MARBLE] = Front.data.maxResources[TradeGoodOrdinals.MARBLE];
        this._data.maxResources[Resources.SULFUR] = Front.data.maxResources[TradeGoodOrdinals.SULFUR];
        this._data.maxResources[Resources.GLASS]  = Front.data.maxResources[TradeGoodOrdinals.GLASS];

        this._data.resources[Resources.WOOD]       = Front.data.resources.resource;
        this._data.resources[Resources.WINE]       = Front.data.resources[TradeGoodOrdinals.WINE];
        this._data.resources[Resources.MARBLE]     = Front.data.resources[TradeGoodOrdinals.MARBLE];
        this._data.resources[Resources.SULFUR]     = Front.data.resources[TradeGoodOrdinals.SULFUR];
        this._data.resources[Resources.GLASS]      = Front.data.resources[TradeGoodOrdinals.GLASS];
        this._data.resources[Resources.CITIZENS]   = Front.data.resources[Resources.CITIZENS];
        this._data.resources[Resources.POPULATION] = Front.data.resources[Resources.POPULATION];

        this._data.production = {}; // Это мы зачищаем, потому что возможен перенос города с одного острова на другой
        this._data.production[Resources.WOOD] = Math.floor(Front.data.resourceProduction * 3600);
        this._data.production[Resources[islandResource]] = Math.floor(Front.data.tradegoodProduction * 3600);
        this._data.production[Resources.WINE_SPENDING] = Front.data.wineSpendings;

        this._data.productionEQ = {};
        this._data.productionEQ[Resources.WOOD] = Front.data.resourceProduction;
        this._data.productionEQ[Resources[islandResource]] = Front.data.tradegoodProduction;

        this._updateWineSpending();

        if (typeof this._data.isOwn === 'undefined') {
            this._data.isOwn = this._forceIsOwn();
        }

        this._data.updatingTime = _.now();

        this._data.__version = VERSION;
        this.save();
    }

    _updateToCurrentVersion() {
        if (VERSION === 2) {
            this._data.isOwn = this._forceIsOwn();
        }
    }

    _forceIsOwn() {
        let city = Front.data.cities[`city_${this._data.id}`];
        if (!city) {
            return false;
        }

        return city.relationship === CityType.OWN;
    }

    /**
     * Get all buildings of this city
     */
    get buildings() {
        return this._data.buildings || null;
    }

    get population() {
        return this._data.resources[Resources.POPULATION];
    }

    _getBuilds(position) {
        if ((!Array.isArray(position)) && (!Front.data.city)) {
            return null;
        }

        if (!Array.isArray(position)) {
            position = Front.data.city.position;
        }

        let builds = {};
        _.each(position, (b, key) => {
            if (!b.name) {
                return;
            }

            b.building = b.building.replace('constructionSite', '').trim();

            if (!builds[b.building]) {
                builds[b.building] = [];
            }

            let building = {
                position:   key,
                building:   b.building,
                canUpgrade: b.canUpgrade,
                isBusy:     b.isBusy,
                isMaxLevel: b.isMaxLevel,
                level:      parseInt(b.level) || 0,
                name:       b.name,
                completed:  (b.completed) ? parseInt(b.completed) : null
            };

            builds[b.building].push(building);
        });

        return builds;
    }

    hasConstructingBuilding() {
        if (this.buildings) {
            return _.some(this.buildings, (b) => {
                return _.some(b, (bb) => {
                    return ((bb.completed) && (bb.completed * 1000 > _.now()));
                });
            });
        }

        return false;
    }

    getPopulationData() {
        if (!this._data.buildings) {
            return null;
        }

        let max = 0;
        let happiness = 196;

        let townHall = this.getBuildingByType(Buildings.TOWN_HALL);
        let temple   = this.getBuildingByType(Buildings.TEMPLE);
        let palace   = this.getBuildingByType(Buildings.PALACE);
        let tavern   = this.getBuildingByType(Buildings.TAVERN);
        let museum   = this.getBuildingByType(Buildings.MUSEUM);
        let research = this._manager.getResearch();

        if (townHall) {
            // Formula from http://ikariam.wikia.com/wiki/Citizen
            max += Math.floor(10 * Math.pow(townHall.level, 1.5)) * 2 + 40;
        }

        if (research.has(Research.Economy.HOLIDAY)) {
            max += 50;
            happiness += 25;
        }
        if (research.has(Research.Economy.ECONOMIC_FUTURE)) {
            let level = research.getLevel(Research.Economy.ECONOMIC_FUTURE);
            max += 20 * level;
            happiness += 10 * level;
        }

        if (palace) {
            if (research.has(Research.Science.WELL_CONSTRUCTION)) {
                max += 50;
                happiness += 50;
            }
            if (research.has(Research.Economy.UTOPIA)) {
                max += 200;
                happiness += 200;
            }
        }

        if (tavern) {
            happiness += 12 * tavern.level;
        }

        happiness += GamePlay.HAPPINESS_PER_WINE_SERVING_LEVEL * this._data.tavernWineLevel;

        if (museum) {
            happiness += 20 * museum.level;
        }

        happiness += GamePlay.HAPPINESS_PER_CULTURAL_GOOD * this._data.culturalGoods;

        let government = this._manager.info.get('government');
        if (government === Government.DEMOCRACY) {
            happiness += 75;
        } else if (government === Government.DICTATORSHIP) {
            happiness -= 75;
        } else if (government === Government.THEOCRACY) {
            if (temple) {
                happiness += Math.min(150, this._data.priests * 5 / max * 100 * 2);
            } else {
                happiness -= 20;
            }
        }

        happiness = happiness * (1 - this.getCorruption());

        let happinessDelta = happiness - this.population;
        let currentPopulation = this.population + happinessDelta * (1 - Math.pow(Math.E, -(this.getTimeSinceResourceUpdate() / 50 / Time.MILLIS_PER_HOUR)));
        let population = Math.min(currentPopulation, max);

        let growth = ((max === population) && (happiness > (population - 1))) ? 0 : (happiness - population) / 50;
        let happinessClass = '';
        if (growth >= 6) {
            happinessClass = 'ecstatic';
        } else if (growth >= 1) {
            happinessClass = 'happy';
        } else if (growth >= 0) {
            happinessClass = 'neutral';
        } else if (growth >= -1) {
            happinessClass = 'sad';
        } else {
            happinessClass = 'outraged';
        }

        growth = parseFloat(growth.toFixed(2));

        return {
            population: population,
            max: max,
            percent: population * 100 / max,
            happiness: happiness - population,
            happinessClass: happinessClass,
            growth: growth
        };
    }

    getCorruption() {
        let palace = this.getBuildingByType(Buildings.GOVERNORS_RESIDENCE) || this.getBuildingByType(Buildings.PALACE);
        let level = palace ? palace.level : 0;
        let corruption = 1 - (level + 1) / this._manager.getOwnCities().length;

        let government = this._manager.info.get('government');
        if (government === Government.ARISTOCRACY ||
            government === Government.OLIGARCHY) {
            corruption += 0.03;
        } else if (government === Government.NOMOCRACY) {
            corruption -= 0.05;
        } else if (government === Government.ANARCHY) {
            corruption += 0.25;
        }

        return Math.min(Math.max(corruption, 0), 1);
    }

    getResearchMultiplier() {
        let research = this._manager.getResearch();
        let rMultiplier = 1.0;
        rMultiplier += research.has(Research.Science.PAPER) ? .02 : 0;
        rMultiplier += research.has(Research.Science.INK) ? .04 : 0;
        rMultiplier += research.has(Research.Science.MECHANICAL_PEN) ? .08 : 0;
        rMultiplier += (research.getLevel(Research.Science.SCIENTIFIC_FUTURE) || 0) * .02;

        return rMultiplier;
    }

    getResearchGovernmentMultiplier() {
        let government = this._manager.info.get('government');

        switch (government) {
            case Government.TECHNOCRACY:
                return 0.05;

            default:
                return 0;
        }
    }

    getResearch() {
        let cMultiplier = 1.0 - this.getCorruption();
        let rMultiplier = this.getResearchMultiplier() + this.getResearchGovernmentMultiplier();

        return this._data.scientists * rMultiplier * cMultiplier;
    }

    getMaxScientists() {
        let b = this.getBuildingByType(Buildings.ACADEMY);
        if (!b) {
            return 0;
        }

        return MAX_SCIENTISTS[b.level];
    }

    getScientistsPercent() {
        let max = this.getMaxScientists();
        if (max === 0) {
            return 0;
        }

        return Math.min(this._data.scientists / max * 100, 100);
    }

    getTimeSinceResourceUpdate() {
        return _.now() - this._data.updatingTime;
    }

    getBuildingByType(type) {
        if (!this._data.buildings) {
            return null;
        }

        let b = this._data.buildings[type];
        if (!b) {
            return null;
        }

        return (BuildingsMultiple[type]) ? b : b[0];
    }

    getResourcesInfo() {
        let total = 2500;
        let safe = 100;

        let warehouses = this.getBuildingByType(Buildings.WAREHOUSE);
        let dump = this.getBuildingByType(Buildings.DUMP);
        _.each(warehouses, (w) => {
            total += 8000 * w.level;
            safe  += 480 * w.level;
        });

        if (dump) {
            total += 32000 * dump.level;
        }

        if (this._manager.isPremiumFeatureEnabled(PremiumFeatures.DOUBLED_STORAGE_CAPACITY)) {
            total *= 2;
        }

        if (this._manager.isPremiumFeatureEnabled(PremiumFeatures.DOUBLED_SAFE_CAPACITY)) {
            safe *= 2;
        }

        return {
            safe: safe,
            capacity: total
        };
    }


    get productionEQ() {
        if (!this._data.productionEQ) {
            this._data.productionEQ = {};
            _.each(this._data.production, (v, k) => {
                if (k !== Resources.WINE_SPENDING) {
                    this._data.productionEQ[k] = v / 3600;
                }
            });
        }

        return this._data.productionEQ;
    }

    /**
     * Get resources of the city
     * @returns {Object}
     */
    get resources() {
        let diff = Math.floor((_.now() - this._data.updatingTime) / 1000);

        // Обновляем значени ресурсов в зависимости от сохраненной скорости производства
        let resources = _.clone(this._data.resources);


        _.each(this.productionEQ, (v, k) => {
            resources[k] += Math.floor(v * diff);
        });

        resources[Resources.WINE] -= Math.floor(this._data.production[Resources.WINE_SPENDING] / 3600 * diff);
        return resources;
    }

    get id() {
        return this._data.id;
    }

    get updatingTime() {
        let diff = Math.floor((_.now() - this._data.updatingTime) / 1000);
        return {hours: Math.floor(diff / 3600), seconds: diff, time: this._data.updatingTime};
    }

    /**
     * Get city production of resources
     * @returns {Object}
     */
    get production() {
        return this._data.production;
    }

    /**
     * Is own city?
     * @returns {Boolean}
     */
    get isOwn() {
        return this._data.isOwn;
    }

    get name() {
        return this._data.name;
    }

    /**
     * Get city relationship
     * @returns {CityType}
     */
    getRelationship() {
        if (Front.data.cities[`city_${this.cityId}`]) {
            return Front.data.cities[`city_${this.cityId}`].relationship;
        } else {
            return CityType.FOREIGN;
        }
    }

    getLoadingSpeed() {
        let speed = 10;
        let ports = this.getBuildingByType(Buildings.TRADING_PORT);

        if (ports[0]) {
            speed = PORT_LOADING_SPEED[ports[0].level];
        }

        if (ports[1]) {
            speed += PORT_LOADING_SPEED[ports[1].level];
        }

        return speed / Time.SECONDS_PER_MINUTE;
    }

    getBuildingsCostDiscount() {
        // Обновляем список "скидок"
        let building = {wood: 'carpentering', marble: 'architect', wine: 'vineyard', glass: 'optician', sulfur: 'fireworker'};
        let discount = {};

        _.each(building, (v, k) => {
            let b = this.getBuildingByType(v);
            discount[k] = (b) ? b.level : 0;
        });

        let r = this._manager.research;
        let redAll = 0;
        if (r.has(Research.Economy.PULLEY))       { redAll += 2; }
        if (r.has(Research.Economy.GEOMETRY))     { redAll += 4; }
        if (r.has(Research.Economy.SPIRIT_LEVEL)) { redAll += 8; }

        _.each(discount, (v, k) => {
            discount[k] = 1 - ((redAll + v) / 100);
        });

        return discount;
    }

    toSave() {
        if (this.getRelationship() !== CityType.FOREIGN) {
            return {
                city: this._data,
                military: this.military.toSave()
            };
        }

        return null;
    }

    save() {
        this._manager.save();
    }


}

module.exports = City; });;
require.toCache('/js/data/info.js', function(require,module,exports) { 'use strict';

const KEY = 'data-info';
class Info {
    constructor() {
        this._data = {
            government: Government.IKACRACY
        };
    }

    updateData(data) {
        this._data = data || {
            government: Government.IKACRACY
        };
    }

    set(key, value) {
        if (this._data[key] !== value) {
            this._data[key] = value;
            Front.ikaeasyData.save();
        }
    }

    get(key) {
        return this._data[key] || null;
    }
}

module.exports = new Info(); });;
require.toCache('/js/data/Manager.js', function(require,module,exports) { 'use strict';

const VERSION = 5;
const Events = require('../helper/event.js');
const Storage = require('../helper/storage.js');
const options = require('../helper/options.js');
const HttpClient = require('../helper/httpClient.js');
const EntityCity = require('./city.js');
const EntityMovement = require('./movement.js');
const GLOBAL_KEY = 'ikaeasy';

class Manager extends Events {
    constructor(callback) {
        super();

        let cb = () => {
            if (_.isFunction(callback)) {
                callback();
            }
        };

        this.loaded = false;
        this.cities = {};
        this.citiesStorage = new Map();
        this.movements = [];
        this.info = require('./info.js');
        this.research = require('./research.js');
        this.options = {};
        this.premium = require('./premium.js');
        this.version = 0;

        Storage.get(GLOBAL_KEY, (err, data) => {
            this.updateAll(data || {}, () => {
                if (this.version < VERSION) {
                    this._updateToCurrentVersion(cb);
                    this.version = VERSION;
                } else {
                    cb();
                }
            });
        });

        Storage.on(GLOBAL_KEY, (val) => {
            this.updateAll(val.newValue || {});
        });
    }

    _updateToCurrentVersion(callback) {
        if (VERSION === 4) {
            this.research.forceUpdate(callback);
        }

        if (VERSION === 5) {
            if (this.options.notification_wait_interaction) {
                options.set('notification_wait_no_interaction', !this.options.notification_wait_interaction);
                delete this.options.notification_wait_interaction;
            }
        }
    }

    updateAll(data, callback) {
        this.cities = {};
        this.citiesStorage = new Map();
        this.movements = [];
        this.options = data.options || {};
        this.version = data.version || 0;
        this.info._data = data.info || this.info._data;

        _.each(data.cities, (data, cityId) => {
            let city = new EntityCity(cityId, this);
            city.load(data);

            this.cities[cityId] = city;
            this.citiesStorage.set(cityId, city);
        });

        this.research.updateData(data.research);
        this.premium.updateData(data.premiumFeatures);

        _.each(data.movements, (data) => {
            let m = new EntityMovement(data, true);
            this.movements.push(m);
        });

        if (!this.loaded) {
            this.getCurrentCity().update();
            this.loaded = true;

            if (_.isFunction(callback)) {
                callback();
            }
        }

        setTimeout(() => {
            this.emit('update');
        }, 1);
    }

    getResearch() {
        return this.research;
    }

    getCity(id) {
        id = parseInt(id);

        if (this.cities[id]) {
            return this.cities[id];
        }


        let c = new EntityCity(id, this);
        this.cities[id] = c;
        this.citiesStorage.set(id, c);
        c.update();

        return c;
    }

    get currentCityId(){
        return Front.data.city && Front.data.city.id ? parseInt(Front.data.city.id) : Front.data.cities.selectedCityId;

    }

    getCurrentCity() {
        return this.getCity(this.currentCityId);
    }

    save() {
        if (this._timeoutCity) {
            return;
        }

        this._timeoutCity = setTimeout(() => {
            this._timeoutCity = null;
            Storage.set(GLOBAL_KEY, this.getJson());
        }, 10);
    }



    // MOVEMENTS
    addMovement(movement) {
        this.movements.push(movement);
        this.save();
    }

    removeMovement(movementId) {
        let index = _.findIndex(this.movements, {id: movementId});
        if (index === -1) {
            return;
        }

        let movement = this.movements[index];
        let stage = movement.getStage();

        if ((stage) && (stage.stage === Movements.Stage.LOADING)) {
            // Надо исправить время всех последующих маршрутов из этого города
            let freeTime = stage.finishTime - _.now();
            _.each(this.movements, (m) => {
                if ((m.id !== movementId) && (m.originCityId === movement.originCityId)) {
                    let s = m.getStage();
                     if ((s) && (s.stage === Movements.Stage.LOADING) && (s.startTime > stage.startTime)) {
                        m.startTime -= freeTime;
                    }
                }
            });
        }

        this.movements.splice(index, 1);
        this.save();
    }




    getJson() {
        let cities = {};
        _.each(this.cities, (city, cityId) => {
            city = city.toSave();
            if (city) {
                cities[cityId] = city;
            }
        });

        let movements = [];
        _.each(this.movements, (v) => {
            if (v.getStage() !== null) {
                movements.push(v.toSave());
            }
        });

        return {
            server: {
                avatarId: Front.data.avatarId,
                domain: Utils.getServerDomain(),
                world: Utils.getServerWorld(),
                name: Front.data.serverName,
                lang: Utils.language
            },

            cities: cities,
            research: this.research.toJSON(),
            info: this.info._data,
            options: this.options || {},
            premiumFeatures: this.premium.toJSON(),
            movements: movements,
            version: VERSION
        };
    }

    getOwnCities() {
        return [...this.citiesStorage.keys()]
            .filter(city => this.citiesStorage.get(city)._data.isOwn === true)
            .sort((x,y) => x == this.currentCityId ? 0 : y == this.currentCityId ? -1 : 0)
    }
    
    get ownCities(){
        let cities = [];
        for(const _cityId of this.getOwnCities()){
            cities.push(new EntityCity(_cityId, this));
        }
        return cities;
    }

    getCapitalCity(){
        return this.ownCities.filter(city => city.isCapital === true)[0];
    }

    getBuildingInfo(building) {
        let data = {
            cnt: 0
        };

        _.each(this.cities, (city, cityId) => {
            if ((city.isOwn) && (city.buildings) && (city.buildings[building]) && (city.buildings[building].length)) {
                data.cnt = Math.max(data.cnt, city.buildings[building].length);
                data.name = city.buildings[building][0].name;
            }
        });

        return data;
    }
    
    async ajaxUpdateAllCities(){
        for(const city of this.ownCities){
            await city.ajaxUpdate();
        }
    }
    async ajaxUpdatePalace(){
        const capitalCity = this.getCapitalCity();
        if(capitalCity.buildings.palace && capitalCity.buildings.palace[0]){
            await HttpClient.ikariam('/', {
                view: 'palace',
                cityId: capitalCity.cityId,
                position: capitalCity.buildings.palace[0].position,
            });
        }
    }

    isPremiumFeatureEnabled(feature) {
        return this.premium._data[feature] && this.premium._data[feature].activeUntil;
    }
}

module.exports = Manager; });;
require.toCache('/js/data/military.js', function(require,module,exports) { 'use strict';

class Military {
    constructor(city) {
        this.city = city;
        this.units = {};

        this.training = [];
    }

    load(data) {
        this.units    = data.units;
        this.training = data.training;
    }

    setCount(type, cnt) {
        if ((cnt === 0) && (this.units[type])) {
            delete this.units[type];
        }

        if (cnt === 0) {
            return;
        }

        this.units[type] = cnt;
        this.city.save();
    }

    setTraining(type, list) {
        this.training = _.filter(this.training, (u) => {
            return u.type !== type;
        });

        this.training = this.training.concat(list);
        this.city.save();
    }

    toSave() {
        return {
            units: this.units,
            training: this.training
        };
    }
}

module.exports = Military; });;
require.toCache('/js/data/movement.js', function(require,module,exports) { 'use strict';

class Movement {
    constructor(data) {
        this.resources = {};
        this.stages = [];
        this.startTime = null;

        if (data) {
            this.id = data.id;
            this.startTime = data.startTime || null;
            this.type = data.type;
            this.mission = data.mission;

            this.originCityId = data.originCityId;
            this.originCityName = data.originCityName;
            this.targetCityId = data.targetCityId;
            this.targetCityName = data.targetCityName;

            this.transports = data.transports;
            this.units = data.units || null;
            this.resources = data.resources || null;

            this.stages = data.stages || [];
        }

        if (this.startTime === null) {
            this.startTime = _.now();
            _.each(Front.ikaeasyData.movements, (m) => {
                if (m.originCityId === this.originCityId) {
                    let stage = m.getStage();

                    if ((stage) && (stage.stage === Movements.Stage.LOADING) && (this.startTime < stage.finishTime)) {
                        this.startTime = stage.finishTime;
                    }
                }
            });
        }
    }

    getId() {
        return this.id;
    }
    getMission() {
        return this.mission;
    }
    addStage(stage, time) {
        let prevTimes = 0;
        _.each(this.stages, (v) => {
            prevTimes += v.time;
        });
        this.stages.push({stage: stage, time: parseInt(time + prevTimes), start: prevTimes});
    }
    getStage() {
        let now = _.now();
        let stage = _.find(this.stages, (v) => {
            if (this.startTime + v.time > now) {
                return true;
            }
        });

        if (stage) {
            return {
                stage: stage.stage,
                time: stage.time,
                start: stage.start,
                startTime: stage.start + this.startTime,
                finishTime: stage.time + this.startTime
            };
        }

        return null;
    }
    getOriginCity() {
        return this.originCityId && Front.ikaeasyData.getCity(this.originCityId);
    }
    getTargetCity() {
        return this.targetCityId && Front.ikaeasyData.getCity(this.targetCityId);
    }
    getArrivalTime() {
        var time = this.getCompletionTime();
        if (this.stage === Movements.Stage.LOADING) {
            time += this.transportTime;
        }
        return time;
    }
    getUnits() {
        return this.units || null;
    }
    getResource(resourceName) {
        return this.resources[resourceName];
    }
    isHostile() {
        return this.type.indexOf('hostile') >= 0;
    }
    isOwn() {
        return this.type.indexOf('own') > -1;
    }

    toSave() {
        return {
            id: this.id,
            startTime: this.startTime,
            type: this.type,
            mission: this.mission,

            originCityId: this.originCityId,
            originCityName: this.originCityName,

            targetCityId: this.targetCityId,
            targetCityName: this.targetCityName,

            transports: this.transports,
            units: this.units,
            resources: this.resources,

            stages: this.stages
        };
    }
}

module.exports = Movement; });;
require.toCache('/js/data/premium.js', function(require,module,exports) { 'use strict';

class PremiumModule {
    constructor() {
        this._data = {};
    }

    updateData(data) {
        if (data && data.time && data.data) {
            this._time = data.time;
            this._data = data.data;

            if (this._time + 86400000 < _.now()) {
                // Данные не обновлялись более суток, обновим на всякий случай
                setTimeout(() => {
                    this.forceUpdate();
                }, _.random(15, 60) * 1000);
            }
        } else {
            // Данных об исследованиях еще нет, получаем их
            this.forceUpdate();
        }
    }

    update(data) {
        this._data = {};
        // e.g: "[{"type":"33","subType":0,"name":"Увеличенная вместительность складов","desc":"Вместительность Ваших складов удваивается.<br />После того, как паровой погрузчик завершит действие, Вы потеряете все ресурсы сверх обычной Вашей вместимости.","cssClass":"itemIcon storageCapacityBonus","cityId":"0","activeUntil":"1585210582","extendPossible":true,"extensionActive":false,"isCancelable":false,"isNegative":false,"extendLabel":"Автоматически продлить на <b>30 д. </b> для:","extendItemCssClass":"itemIcon storageCapacityBonus days thirtyDays","extendItemAmbrosiaCosts":108},{"type":"15","subType":0,"name":"Премиум аккаунт","desc":"Усовершенствованные обзоры, строительные квесты и улучшенные сообщения активны.","cssClass":"itemIcon premiumAccount","cityId":"0","activeUntil":"1586246684","extendPossible":true,"extensionActive":false,"isCancelable":false,"isNegative":false,"extendLabel":"Автоматически продлить на <b>30 д. </b> для:","extendItemCssClass":"itemIcon premiumAccount days thirtyDays","extendItemAmbrosiaCosts":55},{"type":"16","subType":0,"name":"Увеличено производство стройматериалов","desc":"На 20% больше стройматериалов будет добываться на всех островах.","cssClass":"itemIcon resourceBonus","cityId":"0","activeUntil":"1586274052","extendPossible":true,"extensionActive":false,"isCancelable":false,"isNegative":false,"extendLabel":"Автоматически продлить на <b>30 д. </b> для:","extendItemCssClass":"itemIcon resourceBonus days thirtyDays","extendItemAmbrosiaCosts":36},{"type":"17","subType":0,"name":"Увеличенная защита от разграбления","desc":"Больше пространства на складах защищено от разграбления.","cssClass":"itemIcon safeCapacityBonus","cityId":"0","activeUntil":"1590307213","extendPossible":true,"extensionActive":false,"isCancelable":false,"isNegative":false,"extendLabel":"Автоматически продлить на <b>30 д. </b> для:","extendItemCssClass":"itemIcon safeCapacityBonus days thirtyDays","extendItemAmbrosiaCosts":72}]"
        for(const item of data){
            this._data[item.type] = item;
        }

        this._time = _.now();
        Front.ikaeasyData.save();
    }

    toJSON() {
        return {
            time: this._time,
            data: this._data
        };
    }

    forceUpdate() {
        $.get(`/index.php?view=inventory&ajax=1`, (data) => {
            data = data[1][1][2].viewScriptParams.activeModifiers;
            this.update(data);
        }, 'json');
    }
}

module.exports = new PremiumModule(); });;
require.toCache('/js/data/research.js', function(require,module,exports) { 'use strict';

const TYPES = ['economy', 'knowledge', 'seafaring', 'military'];
class ResearchModule {
    constructor() {
        this._data = {};
    }

    updateData(data) {
        if (data) {
            this._time = data.time;
            this._data = data.data;

            if (this._time + 86400000 < _.now()) {
                // Данные не обновлялись более суток, обновим на всякий случай
                setTimeout(() => {
                    this.forceUpdate();
                }, _.random(15, 60) * 1000);
            }
        } else {
            // Данных об исследованиях еще нет, получаем их
            this.forceUpdate();
        }
    }

    has(id) {
        if (!this._data) {
            return;
        }

        return this._data[id] > 0;
    }

    getLevel(id) {
        if (!this._data) {
            return;
        }

        return this._data[id];
    }

    update(data) {
        _.each(data, (v, name) => {
            let id = parseInt(v.aHref.match(/([0-9]+$)/)[1]);
            let level = (/explored/.test(v.liClass)) ? 1 : 0;

            if ((!level) && ([Research.Economy.ECONOMIC_FUTURE, Research.Military.MILITARISTIC_FUTURE, Research.Science.SCIENTIFIC_FUTURE, Research.Seafaring.SEAFARING_FUTURE].indexOf(id) > -1)) {
                level = (/(explored|explorable)/.test(v.liClass)) ? 1 : 0;
            }

            if (level) {
                let m = name.match(/\((\d+)\)/);
                if (m && m.length) {
                    level = parseInt(m[1]) - 1;
                }
            }

            this._data[id] = level;
        });

        this._time = _.now();
        Front.ikaeasyData.save();
    }

    toJSON() {
        return {
            time: this._time,
            data: this._data
        };
    }

    forceUpdate(callback) {
        let index = 0;

        let ajax = () => {
            if (index >= TYPES.length) {
                if (_.isFunction(callback)) {
                    callback();
                }

                return;
            }

            $.get(`/index.php?view=noViewChange&researchType=${TYPES[index]}&templateView=researchAdvisor&actionRequest=${Front.data.actionRequest}&ajax=1`, (data) => {
                data = JSON.parse(data[2][1].new_js_params).currResearchType;
                this.update(data);

                index++;
                ajax();
            }, 'json');
        };

        ajax();
    }
}

module.exports = new ResearchModule(); });;
require.toCache('/js/page/common.js', function(require,module,exports) { 'use strict';

const Controller = require("./controller.js");
class Common extends Controller{
    constructor() {
        super();
    }

    /**
     * Смена города без обновления страницы
     * @param city_id {Number}
     */
    changeCity(city_id) {
        $('#js_cityIdOnChange').val(city_id);
        Utils.execute_js('ajaxHandlerCallFromForm(document.getElementById("changeCityForm"));');
    }

    /**
     * Рендер шаблонов
     * @param tpl {String} имя файла шаблона
     * @param data {Object} данные для шаблона
     * @returns {String}
     */
    render(tpl, data = {}) {
        const templater = require('../helper/templater.js');
        return templater.render(tpl, data)
    }

    /**
     * Открыть нужное здание
     * @param params
     */
    openBuilding(params) {
        Utils.removeItem('open_building_callback');

        let b = params || Utils.getItem('open_building') || {};
        if ((!b.cityId) || (!b.building) || (typeof b.position === 'undefined')) {
            Utils.removeItem('open_building');
            return;
        }

        if ((params) && (Front.bg !== 'city')) {
            location.href = `/index.php?view=${ b.building }&cityId=${ b.cityId }&position=${ b.position }&backgroundView=city&currentCityId=${ b.cityId }`;
            return;
        }

        if (this.getCityId() !== b.cityId) {
            if (params) {
                Utils.setItem('open_building', params, 5);
            }

            this.changeCity(b.cityId);
        } else {
            if (b.callback) {
                Utils.setItem('open_building_callback', b, 5);
            }

            Utils.execute_js(`ajaxHandlerCall('?view=${b.building}&cityId=${b.cityId}&position=${b.position}&actionRequest=${this._data.actionRequest}');`);
            Utils.removeItem('open_building');
        }
    }

    /**
     * Запуск постройки здания
     * @param position
     * @param level
     * @param cityId
     */
    upgradeBuilding(position, level, cityId = null) {
        cityId = cityId || this.getCityId();
        Utils.execute_js(`ajaxHandlerCall('/index.php?action=CityScreen&function=upgradeBuilding&actionRequest=${this._data.actionRequest}&currentCityId=${cityId}&cityId=${cityId}&position=${position}&level=${level}&backgroundView=city');`);
    }
}

module.exports = Common; });;
require.toCache('/js/page/controller.js', function(require,module,exports) { 'use strict';

class Controller {
    constructor() {
        this._ieData = Front.ikaeasyData;
        this._modules = {};
        this._updateData();

        this.options = require('../helper/options.js');
    }
    _ajaxMode = false;

    set ajaxHTML(rawHTML){
        // not recommended to use with null or false
        // but just in case you will need to disable ajax mode
        if(rawHTML === null || typeof rawHTML === Boolean){
            this._ajaxHTML = false
            this._ajaxMode = false;
        }
        if(rawHTML === '' || rawHTML.length === 0){
            console.error("IkaEasy: AjaxHTML is empty");
        }
        try{
            const htmlParsed = $.parseHTML(rawHTML);
            this._ajaxHTML = $(htmlParsed);
            this._ajaxMode = true;
        }catch(err){
            console.errror(`IkaEasy: ${err}`);
        }
    }
    get ajaxHTML(){
        return this._ajaxHTML;
    }
    _ajaxHTML = null;

    DOMselect(query){
        return this._ajaxMode ? this.ajaxHTML.find(query) : $(query);
    }

    refresh() {
        _.each(this._modules, (module) => {
            module.refresh();
            module.updated();
        });

        this._updateData();
    }

    _updateData() {
        this._data = Front.data;
        this._prepareCities();
    }

    get _city() {
        return this._overrideCity || this._ieData.getCurrentCity();
    }
    setCurrentCity(cityId){
        this._overrideCity = this._ieData.getCity(cityId);
    }
    _overrideCity = null;

    _prepareCities() {
        let cities = [];
        _.each(this._data.cities, (city, key) => {
            if (key.indexOf('city_') === 0) {
                city.id = parseInt(city.id);
                cities.push(city);
            }
        });

        this._cities = Object.freeze(cities);
    }

    broker() {
        return require('../helper/broker.js');
    }

    /**
     * Получить  cityId
     * @returns {Number} cityId
     */
    getCityId() {
        if ((this._data.city) && (this._data.city.id)) {
            return parseInt(this._data.city.id);
        }

        return this._data.cities.selectedCityId;
    }

    /**
     * Создать модуль
     * @param name {String} имя файла модуля
     * @returns {Object}
     */
    createModule(name) {
        if (!/\.js$/.test(name)) {
            name += '.js';
        }

        if (!this._modules[name]) {
            const module = require(`./modules/${name}`);
            this._modules[name] = new module(this);
        }

        return this._modules[name];
    }

    /**
     * userId игрока
     * @returns {Number}
     */
    get userId() {
        return this._data.avatarId;
    }

    destroy() {
        _.each(this._modules, (module, name) => {
            module.destroy();
        });

        this._modules = null;
    }
}

module.exports = Controller; });;
require.toCache('/js/page/bg/city.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class City extends Parent {
    init() {
        if ((!this.buildings) || (this.buildings.cityId !== this.getCityId())) {

        }

        this.premium();
        this.updateBuilds();
        this.watcher();
    }

    async premium() {
        return;
        let [p1, p2] = await Promise.all([ this.broker().getPurchases(), this.broker().getSkuDetails() ]);
        console.log(p1, p2)
    }

    premiumUpdated() {
        this.premium();
    }

    getCityId() {
        return parseInt(this._data.city.id);
    }

    getBuildLevel(name) {
        if (!this._builds[name]) {
            return 0;
        }

        return this._builds[name][0].level || 0;
    }

    updateBuilds() {
        this._builds = this._city.buildings;

        if ((this._city.isOwn) && (this._builds['embassy'])) {
            let b = this._builds['embassy'][0];
            let emb = { title: b.name, pos_id: b.position, city_id: this.getCityId() };
            Utils.setItem('embassy', emb);
        }
    }

    watcher() {
        this.__watcher_is_updating = true;
        this._fillWatcherMinus();

        $('#ikaeasy_builds').remove();

        if (!this.options.get('city_details', true)) {
            return;
        }

        const db = require('../../helper/db.js').db();
        let $worldmap = $('#worldmap');
        let $parent = $('<div id="ikaeasy_builds"></div>');
        let location = $('#locations');
        $worldmap.append($parent);

        $parent.css({
            top: $(location).css('top'),
            left: $(location).css('left'),
            width: $(location).width(),
            height: $(location).height()
        });

        _.each(this._builds, (builds, name) => {
            _.each(builds, (build) => {
                if (typeof build.level === "undefined") {
                    return;
                }

                let b_coord = (build.completed) ? db.pos.constructionSite : db.pos[name];
                let $position = $(`#position${build.position}`);

                  // Создаем у каждого здания табличку для уровня, а так же блок с ресами
                let $block = $(this.render('city-buildingInfo.ejs', { build : build }));
                $block.css({
                    left: parseInt($position.css('left')) + b_coord[0].x,
                    top: parseInt($position.css('top')) + b_coord[0].y
                });

                $parent.append($block);

                if (!this._city.isOwn) {
                    $(`#ikaeasy_watcher_${build.position}`).attr('class', 'ikaeasy_watcher build_gray');
                    $(`#ikaeasy_watcher_${build.position} .ikaeasy_watcher_buttons`).remove();
                }
            });
        });

        if (!this.options.get('city_building_tooltip')) {
            $parent.addClass('ikaeasy_watcher_no_tooltip');
        }

        this.__watcher_is_updating = false;
        this.updateWatcher();
    }

    updateWatcher() {
        if ((!this._city.isOwn) || (this.__watcher_is_updating)) {
            return;
        }

        if (!this.options.get('city_details', true)) {
            return;
        }

        this.__watcher_is_updating = true;

        this.updateBuilds();
        const db = require('../../helper/db.js').db();

        // Узнаем кол-во ресурсов в городе
        let sourceOnCity = this._city.resources;
        let production = this._city.production;

        // Проверяем, нет ли строящихся зданий?
        let bb_icon = ($('#locations .constructionSite').length > 0) ? 'build_blue' : 'build_green';

        _.each(this._builds, (builds, name) => {
            _.each(builds, (build) => {
                if (typeof build.level === "undefined") {
                    return;
                }

                let $block = $(`#ikaeasy_watcher_${build.position}`);
                let b_source = db.source[name];
                let b_coord = db.pos[name];
                let b_lvl = parseInt(build.level);

                if (build.completed) {
                    b_coord = db.pos.constructionSite;
                    b_lvl++;
                }

                let $tooltip = $('.ikaeasy_watcher_tooltip', $block);
                $tooltip.empty();

                let sources_ok = true;
                let class_icon = 'build_red';
                if (b_source[b_lvl]) {
                    const resourcesTypesCount = Object.values(b_source[b_lvl]).length;
                    let enoughPercent = 0;
                    let tooltipData = [];
                    _.each(b_source[b_lvl], (v, k) => {
                        if (v === 0) {
                            return;
                        }

                        let cost = Math.floor(v * this.__watcher_minus[k]);
                        const currentRes = sourceOnCity[k];
                        let need = currentRes - cost;
                        const percentAdded= currentRes < cost ? currentRes / cost * 100 : 100;
                        enoughPercent += percentAdded / resourcesTypesCount;
                        tooltipData.push({
                            resource: k,
                            cost: cost,
                            need: need,
                            production: (need >= 0) ? 0 : production[k]
                        });

                        if (need < 0) {
                            sources_ok = false;
                        }
                    });

                    if (this.options.get('city_building_tooltip')) {
                        let $line = $(this.render('city-watcherTooltip.ejs', {
                            list: tooltipData,
                            ok: sources_ok,
                            build: build
                        }));
                        $tooltip.append($line);
                    }

                    if (sources_ok) {
                        class_icon = (build.completed) ? 'build_gray' : bb_icon;
                    }
                    if(enoughPercent < 100 && enoughPercent > 0){
                        const circumference = 81.6814;
                        const progressStroke = circumference - enoughPercent / 100 * circumference;
                        $('.ikaeasy_watcher_circle-progress__circle', $block)
                        .attr('style',`stroke-dashoffset: ${progressStroke}`)
                        .addClass("ikaeasy_watcher_circle-progress-active");
                    }
    
                } else {
                    class_icon = 'build_gray';
                }

                if (build.completed) {
                    b_coord = db.pos.constructionSite;
                    let $position = $(`#position${build.position}`);
                    $block.css({
                        left: parseInt($position.css('left')) + b_coord[0].x,
                        top: parseInt($position.css('top')) + b_coord[0].y
                    });

                    class_icon += ' ikaeasy_watcher_construction';
                }
                // progress bar inspired by:
                // @link https://css-tricks.com/building-progress-ring-quickly/ 
                $(`#ikaeasy_watcher_${build.position}`).attr('class', `ikaeasy_watcher ${class_icon}`).show();
                $('.watche_down', $block).off('click').click((e) => {
                    if ($(e.currentTarget).css('cursor') === 'default') {
                        return;
                    }

                    let code = this.render('js-confirmPopup.ejs', {
                        txtAreYouSure: LANGUAGE.getLocalizedString('city_confirm_downgrade'),
                        code: `ajaxHandlerCall('/index.php?action=CityScreen&function=demolishBuilding&actionRequest=${this._data.actionRequest}&currentCityId=${this.getCityId()}&cityId=${this.getCityId()}&position=${build.position}&level=${build.level}&backgroundView=city');`
                    });

                    Utils.execute_js(code);
                });

                $('.watche_up', $block).off('click').click((e) => {
                    if ($(e.currentTarget).css('cursor') === 'default') {
                        return;
                    }

                    this.upgradeBuilding(build.position, build.level);
                });

                $('.ikaeasy_watcher_title', $block).off('click').click((e) => {
                    this.openBuilding({
                        cityId: this.getCityId(),
                        building: build.building,
                        position: build.position
                    });
                });
            });
        });

        this.__watcher_is_updating = false;
    }

    _fillWatcherMinus() {
        this.__watcher_minus = this._city.getBuildingsCostDiscount();
    }
}

module.exports = City; });;
require.toCache('/js/page/bg/dummy.js', function(require,module,exports) { 'use strict';

const Parent = require('../common.js');
const MAP_URL = 'https://ikalogs.ru/tools/map/';
class Dummy extends Parent {
    constructor() {
        super();

        this.init();
        this.support();
        this.openMap();
        this.nextCity();
        this.getProduction();
        this.goldConsumption();
        this.addOtherButtons();
        this.transporter();
        this.smallTweaks();
        this.notes();
        this.initCityHotkeys();
        this.checkAdvisor();
        this.quickMenu();

        if (this.options.get('empire', true)) {
            this.empireModule = this.createModule('empire');
        }

        if (Utils.getItem('open_building')) {
            this.openBuilding();
        }
    }

    init() {

    }

    _updateData() {
        super._updateData();
        this._city.update();
    }

    /**
     * Дабы из перезаписываемой функции не дергать родительскую функцию
     */
    refresh() {
        super.refresh();


        setTimeout(() => {
            this.goldConsumption();
        }, 100);

        this.transporter();
        this.getProduction();
        this.addOtherButtons();
        this.checkAdvisor();

        if (Utils.getItem('open_building')) {
            this.openBuilding();
        }
    }

    updated() {
        this.init();
    }

    premiumUpdated() {

    }

    checkAdvisor() {
        if (!this.options.get('notification_advisor', false)) {
            return;
        }

        let advisor = {};
        _.each(Front.data.advisorData, (v, k) => {
            if (v.cssclass) {
                advisor[k] = (v.cssclass.indexOf('active') > -1);
            }
        });

        let current_advisors = Utils.getItem('advisor_status') || {};
        _.each(advisor, (v, k) => {
            if ((v) && (!current_advisors[k])) {
                let params = {
                    action: 'advisor',
                    advisor: k,
                    random: _.now()
                };

                Utils.sendNotification('notif.advisor_' + k, 'notif.advisor_updated', params);
            }
        });

        Utils.setItem('advisor_status', advisor);
    }

    nextCity() {
        if ($('#ikaeasy_nextCity').length) {
            return;
        }

        if (this._cities.length < 2) {
            return;
        }

        let $nextCity = $('<li class="ikaeasy_nextCity" id="ikaeasy_nextCity"></li>');
        $('#cityResources .resources').prepend($nextCity);

        $nextCity.click(() => {
            let currentId = this._data.cities.selectedCityId;
            let current = _.findIndex(this._cities, {id: currentId});
            let nextCity = this._cities[current + 1] || this._cities[0];

            this.changeCity(nextCity.id);
        });
    }

    getProduction() {
        if (!this.options.get('dummy_resource_prod', true)) {
            return;
        }

        $('.ikaeasy_delete_me').remove();

        const resCol = [Resources.WOOD, Resources.WINE, Resources.MARBLE, Resources.GLASS, Resources.SULFUR];
        _.each(resCol, (resource) => {
            let cnt = this._city.production[resource] || 0;
            let wineLeftTime = 0;

            if (resource === Resources.WINE) {
                cnt -= this._city.production[Resources.WINE_SPENDING];

                if (cnt < 0) {
                    wineLeftTime = Math.abs(this._city.resources[ Resources.WINE ] / cnt);
                    wineLeftTime = Utils.transformHours(wineLeftTime);

                    $(`#js_GlobalMenu_wine_tooltip table tbody tr:eq(1)`).after(this.render('dummy-wineSpending.ejs', {wineLeftTime: wineLeftTime, cnt: cnt}));
                }
            }

            if ((typeof this._city.production[resource] !== 'undefined') || (resource === Resources.WINE)) {
                let cntFormatted = Utils.formatNumber(cnt);
                $(`#resources_${resource}`).append(this.render('dummy-resourceProd.ejs', {
                    cnt: cnt,
                    cntFormatted: cntFormatted,
                    resource: resource,
                    wineLeftTime: wineLeftTime
                }));
            }
        });
    }

    goldConsumption() {
        if (($('#IkaEasy_Gold_per_hour').length) || (!(this.options.get('dummy_resource_prod', true)))) {
            return;
        }

        let gold = parseInt(this._data.gold.income + this._data.gold.scientistsUpkeep + this._data.gold.upkeep + this._data.gold.badTaxAccountant);
        $("#js_GlobalMenu_gold").append(`<span id="IkaEasy_Gold_per_hour" class="ikaeasy_delete_me ikaeasy_${(gold >= 0) ? 'green' : 'red'}">${Utils.formatNumber(gold)}</span>`);
    }

    addOtherButtons() {
        let emb = Utils.getItem('embassy');
        if (emb) {
            // Кнопка на открытие посольства
            let $embassy = $('#leftMenu .image_embassy').closest('li');
            if (!$embassy.length) {
                $embassy = Utils.addToLeftMenu('image_embassy', emb.title, false, this.options.get('quick_menu'));

                $embassy.click(() => {
                    this.openBuilding({
                        building: 'embassy',
                        cityId: emb.city_id,
                        position: emb.pos_id
                    });
                });
            }
        }
    }

    support() {
        let $li = Utils.addToLeftMenu('image_support', LANGUAGE.getLocalizedString('support_text'), true, this.options.get('quick_menu'));
        $li.click(() => {
            let support = require('../../helper/support.js');
            support.show();
        });
    }

    openMap() {
        let usernick = $('#GF_toolbar .avatarName a.noViewParameters').attr('title');
        let $li = Utils.addToLeftMenu('image_map', LANGUAGE.getLocalizedString('open_map_text'), true, this.options.get('quick_menu'));
        $li.click(() => {
            window.open(`${MAP_URL}?server=${Utils.getServerId()}&world=${Utils.getServerWorld().substring(1)}&search=city&nick=${encodeURIComponent(usernick)}`, '_blank');
        });
    }

    transporter() {
        if (!this.options.get('dummy_transporter', true)) {
            return;
        }

        if ($('#ikaeasy_transporter').length) {
            $(`#ikaeasy_transporter .current_city`).removeClass('current_city');
            $(`#ikaeasy_transporter [data-id="${this._data.cities.selectedCityId}"]`).addClass('current_city');
            return;
        }

        if (this._cities.length < 2) {
            return;
        }

        let $window = $('<div class="ikaeasy_dynamic"></div>');
        $('body').append($window);

        let pos = Utils.getItem('transporter_position');
        if (pos) {
            pos.top = Math.max(20, pos.top);
            pos.left = Math.max(20, pos.left);

            $window.css(pos);
        }

        let $cities = $('<div class="ikaeasy_transporter" id="ikaeasy_transporter"></div>');
        let $notMyCities = null;
        _.each(this._cities, (city, key) => {
            let isCurrent = (city.id === this._data.cities.selectedCityId);
            let $city = $(this.render('dummy-transporterCity.ejs', { city: city, current: isCurrent }));

            $city.on('click', '.empire_city>span', () => {
                if (!$city.hasClass('current_city')) {
                    this.changeCity(city.id);
                }
            });

            $city.on('click', '[data-js]', (e) => {
                if (!$city.hasClass('current_city')) {
                    let js = $(e.currentTarget).data('js');
                    Utils.execute_js(js);
                }
            });

            if (city.relationship !== CityType.OWN) {
                if (!$notMyCities) {
                    $notMyCities = $('<div id="ikaeasy_not_mycities"></div>');
                }

                $notMyCities.append($city);
            } else {
                $cities.append($city);
            }
        });

        if ($notMyCities) {
            $cities.append('<div class="box_border" id="ikaeasy_box_border"></div>');
            $cities.append($notMyCities);

            $('#ikaeasy_box_border', $cities).click(function() {
                $notMyCities.slideToggle('fast', function() {
                    Utils.setItem('transporter_is_show_not_my', $notMyCities.is(':visible'));
                });
            });

            if (Utils.getItem('transporter_is_show_not_my')) {
                setTimeout(() => {
                    $notMyCities.show();
                }, 50);
            }
        }

        let $dynamicWin = Utils.createDynamicWin(LANGUAGE.getLocalizedString('dummy_transporter'));
        $window.append($dynamicWin);

        function toggleWindow(b) {
            if (typeof b !== 'boolean') {
                b = !Utils.getItem('transporter_is_show');
            }

            if (b) {
                $window.show();
                $dynamicWin.find('.dynamic').append($cities);
                $li.removeClass('ikaeasy-transporter-left');
            } else {
                $window.hide();
                $li.addClass('ikaeasy-transporter-left').append($cities);
            }

            Utils.setItem('transporter_is_show', b);
        }


        let $li = Utils.addToLeftMenu('image_transporter', LANGUAGE.getLocalizedString('dummy_transporter'), false, this.options.get('quick_menu'));
        $li.click((e) => {
            let $el = $(e.target);
            if (($el.hasClass('ikaeasy_transporter')) || ($el.closest('.ikaeasy_transporter').length)) {
                return;
            }

            toggleWindow();
        });

        $('.indicator', $window).click(function(e) {
            e.preventDefault();
            toggleWindow(false);
        }.bind(this));

        toggleWindow(Utils.getItem('transporter_is_show'));

        Utils.draggable($('.dynamic_title', $window), $window, () => {
            Utils.setItem('transporter_position', $window.offset());
        });
    }

    addLinkToIslandFeature() {
        let $resourceType = $('ul.resources li div p:first-child');
        let islandId = this._data.island.islandId;

        // Добавляем ссылку для дерева
        $('#resources_wood').css('cursor', 'pointer').attr('onClick', `ajaxHandlerCall('?view=resource&type=resource&islandId=${islandId}'); return false;`);

        // Добавляем ссылку для Драгоценного ресурса
        $resourceType.not(".invisible").eq(1).parent().parent().css('cursor', 'pointer').attr('onClick', `ajaxHandlerCall('?view=tradegood&islandId=${islandId}'); return false;`);
    }

    smallTweaks() {
        if (this.options.get('auto_accept_daily_bonus', true)) {
            if ($("#dailybonus").length) {
                Utils.execute_js('ajaxHandlerCallFromForm($("#dailybonus")[0]); $("body").trigger("click.dropDown"); ikariam.getMultiPopupController().closePopup();');
            }
        }

        if (this.options.get('hide_ads', true)) {
            $('body').addClass('ikaeasy-hide-ads');
        }

        if (this.options.get('hide_friends_bar', false)) {
            $('body').addClass('ikaeasy-hide-friends');
        }

        if (this.options.get('hide_happy_hour', false)) {
            $('#btnIngameCountdown1.happyHour').parent().hide();
        }
    }

    notes() {
        if ((this.options.get('notes')) && (!$('#GF_toolbar li.notes').data('ikaeasy'))) {
            this.createModule('notes');
        }
    }

    initCityHotkeys() {
        if (!this.options.get('city_hotkeys', true)) {
            return;
        }

        const hotkeys = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 189, 187];
        let stopShortcut = false;
        $(document).on('keydown.hotkeys', (e) => {
            let index = hotkeys.indexOf(e.keyCode);
            if ((!stopShortcut) && (index > -1)) {
                if (typeof this._cities[index] !== 'undefined') {
                    let city = this._cities[index];
                    if (city.id === this._data.cities.selectedCityId) {
                        return;
                    }

                    this.changeCity(city.id);
                }
            }
        });

        $(document).on('focus.hotkeys', 'input, textarea', () => {
            stopShortcut = true;
        });

        $(document).on('blur.hotkeys', 'input, textarea', () => {
            stopShortcut = false;
        });
    }

    quickMenu() {
        if (this.options.get('quick_menu')) {
            $('li.expandable').addClass('expandable-quick').hover(
                function() {
                    $(this).addClass('hover');
                }, function() {
                    $(this).removeClass('hover');
                }
            );
        }
    }

    destroy() {
        super.destroy();
    }

    selfDestroy() {
        this.destroy();
    }
}

module.exports = Dummy; });;
require.toCache('/js/page/bg/island.js', function(require,module,exports) { 'use strict';


const Parent = require('./dummy.js');
class Island extends Parent {
    init() {
        this.island = this._data.island;
        this.islandId = parseInt(this.island.islandId);

        this.showIslandInfo();
        this.colorizeIt('ally');
        this.colorizeIt();

        if (this.options.get('island_details', true)) {
            $('#islandresource').append($(`<div class="ikaeasy_watcher build_blue ikaeasy_watcher_island ikaeasy_watcher-wood"><div class="ikaeasy_watcher_circle">${this.island.wood}</div></div>`));
            $('#islandtradegood').append($(`<div class="ikaeasy_watcher build_blue ikaeasy_watcher_island ikaeasy_watcher-tradegood"><div class="ikaeasy_watcher_circle">${this.island.tradegood}</div></div>`));
            $('#islandwonder').append($(`<div class="ikaeasy_watcher build_blue ikaeasy_watcher_island ikaeasy_watcher-wonder"><div class="ikaeasy_watcher_circle">${this.island.wonder}</div></div>`));
        }
    }

    updated() {
        this.showIslandInfo(false);
        this.colorizeIt('ally');
        this.colorizeIt();
    }

    colorizeIt(colorKind = 'player', removedMarker = false) {

        const resetMarkers = (city, colorKind = null) => {
            let setColor = null;
            // Keep other class if exist
            if (colorKind) {
                const cityHover = city.find('.hover');
                const attributes = cityHover.attr('class');

                let re = /(linkHover_)+[a-z]*[_]/gmi;
                if (colorKind === 'player') {
                    re = /(linkHover_)+[a-z]*($|\s)/gmi;
                }
                setColor = attributes.match(re);

                if (setColor) {
                    setColor = setColor[setColor.length - 1]
                        .replace('linkHover_', '')
                        .replace(/[^a-z]/gmi, "");
                }
            }

            city.find('.hover').attr('class', 'hover island_feature_img invisible');
            city.find('.link_img').attr('class', 'link_img island_feature_img');
            city.find('.link_img .flag').attr('class', 'position flag animation_16steps');

            if (setColor) {
                setClasses(city, setColor, colorKind === 'ally' ? 'player' : 'ally');
            }
        };

        const removeMarker = (colorKind) => {
            const name = colorKind === 'ally' ? 'ownerAllyTag' : 'ownerName';
            for(let i = 0; i < GamePlay.TOWN_SPOTS; i++) {
                let $city = $(`#cityLocation${i}`);
                
                if (!$city.hasClass('treaty')) {
                    let info = this.island.cities[i];
                    
                    if ((!info[name]) || (info.type !== 'city')) {
                        continue;
                    }
                    if (this.island.cities[i][name] === removedMarker) {
                        const id = this.island.cities[i].id;
                        let cityToClear;
                        
                        if ($(`.location_list a[href*="${id}"]`).length) {
                            cityToClear = $(`.location_list a[href*="${id}"]`).parent();
                        } else if ($(`.location_list div[saved-href*="${id}"]`).length) {
                            cityToClear = $(`.location_list div[saved-href*="${id}"]`);
                        }

                        resetMarkers(cityToClear, colorKind);
                    }
                }                
            }
        };

        const setClasses = ($city, color, colorKind) => {
            resetMarkers($city, colorKind);

            if (color) {
                let isPlayer = colorKind === 'player' ? '_u' : '';
                const isAnimated = $city.hasClass('animated_off') ? '_animated' : '';
                const link = `ikaeasy_city_link_${color + isAnimated + isPlayer}`;
                const hoverLink = `ikaeasy_city_linkHover_${color + isPlayer}`;
                const flag = `ikaeasy_flag_${color}_animated${isPlayer}`;

                $city.find('.hover').addClass(hoverLink + `${colorKind === 'player' ? ' userMarked' : ''}`);
                $city.find('.link_img').addClass(link);
                $city.find('.link_img .flag').addClass(flag);
            }
        };

        const list = require('../../helper/marker.js').name;
        const name = colorKind === 'ally' ? 'ownerAllyTag' : 'ownerName';

        for(let i = 0; i < GamePlay.TOWN_SPOTS; i++) {
            let $city = $(`#cityLocation${i}`);
            if (!$city.hasClass('treaty')) {
                let info = this.island.cities[i];

                if ((!info[name]) || (info.type !== 'city')) {
                    continue;
                }

                info[name] = info[name].trim();
                _.each(list, (v, color) => {
                    _.each(v, (a) => {
                        if (a.endsWith('_ally')) {
                            a = a.replace('_ally', '');
                        }
                        if (a.trim() === info[name]) {
                            setClasses($city, color, colorKind);
                        }
                    });
                });

                if (removedMarker) {
                    removeMarker(colorKind);
                }
            }
        }
    }

    sendWorld(force = false) {
        if (this._worldUpdating) {
            return;
        }

        let cities = this.island.cities;

        if ((!Utils.getItem(`island_v2_${this.islandId}`)) || (force)) {
            let score = {};
            let activeCities = 0;
            this._worldUpdating = true;

            this.getUsersInfo((users) => {
                _.each(cities, function(city) {
                    if (city.type === "city") {
                        activeCities++;
                        score[city.ownerId] = users[city.ownerId]['s'];
                    }
                }.bind(this));

                let result = _.clone(this.island);
                result['server'] = Utils.getServerDomain();
                result['world'] = Utils.getServerWorld().substring(1);
                result['score'] = score;

                require('../../helper/ikalogsRu.js').sendWorld(result);
                Utils.setItem(`island_v2_${this.islandId}`, 'true', 86400);

                let islandsData = Utils.getItem('islands_data') || {};
                islandsData[this.islandId] = {
                    count: activeCities
                };

                Utils.setItem('islands_data', islandsData);

                this._worldUpdating = false;
            });
        }
    }

    showIslandInfo(updateLevel = true) {
        if (!this._worldUpdating) {
            this.getUsersInfo();
        }

        let cities = this.island.cities;
        let now = Math.floor(_.now() / 1000);
        let users = Utils.getItem('users') || {};
        let active_cities= 0;

        if ($('.ikaeasy_score').length === 0) {
            _.each(cities, (city, index) => {
                if (city.type === "city") {
                    active_cities++;

                    if (this.options.get('island_details', true)) {
                        let $city = $(`#cityLocation${index}`);
                        let $cityTitle = $(`#js_cityLocation${index}TitleText`);

                        let ally = (city.ownerAllyTag) ? ` [${city.ownerAllyTag}]` : '';
                        let cityNewTitle = [`<span class="ikaeasy_city_title">${$cityTitle.html()}${ally}</span>`, ' <span class="ikaeasy_score"></span>'];

                        if ((this.options.get('island_ap', true)) && (city.level)) {
                            let ap = Math.floor(city.level / 4 + 3) - (($city.hasClass("own")) ? 0 : 2);
                            cityNewTitle.push(`<span class="ikaeasy_BD">${ ap }</span>`);
                        }

                        $cityTitle.html(cityNewTitle.join(''));
                        if ((updateLevel) && (city.level)) {
                            $city.append(`<div class="ikaeasy_levelcity">${city.level}</div>`);
                        }

                        this.recalcWidth(index);
                    }

                    if (this.options.get('island_ships_owner', true)) {
                        let $ships = $(`#js_cityLocation${index}Ships.fleetAction`);

                        if (($ships.length) && (!$ships.find('.ikaeasy_island_cityInfo_ships_name').length)) {
                            let ships_username = _.last($ships.attr('title').split(' '));
                            $ships.append(`<div class="ikaeasy_island_cityInfo_ships_name">${ships_username}</div>`);
                        }
                    }
                }
            });
        }

        this.getUsersInfo((users) => {
            _.each(cities, (city, index) => {
                if (this.options.get('island_details', true)) {
                    if (city.type === 'city') {
                        let $score = $(`#js_cityLocation${index}TitleText span.ikaeasy_score`);
                        $score.html(`#${Utils.numberToBeauty(users[city.ownerId].s)}`);
                        this.recalcWidth(index);
                    }
                }
            });

            let islands_data = Utils.getItem('islands_data') || {};
            if ((islands_data[this.islandId]) && (islands_data[this.islandId].count !== active_cities)) {
                this.sendWorld(true);
            } else {
                this.sendWorld();
            }
        });
    }

    getUsersInfo(callback) {
        let users_req = {};
        let users = Utils.getItem('users') || {};
        let now = Math.floor(_.now() / 1000) - 3;
        let done = _.after(this.island.cities.length, () => {
            Utils.setItem('users', users, 86400);
            callback && callback(users);

            setTimeout(this.clearExpiredUsers.bind(this), 1000);
        });

        _.each(this.island.cities, (city) => {
            if (city.type === "city") {
                let ownerId = city.ownerId;

                if ((!users[ownerId]) || (!users[ownerId].s) || (users[ownerId].e < now)) {
                    if (!users_req[ownerId]) {
                        users_req[ownerId] = true;
                        $.get(`/index.php?view=cityDetails&destinationCityId=${city.id}&ajax=1`, (data) => {
                            data = JSON.parse(data)[1][1][1];

                            let score = $.trim(data.match(/id="js_selectedCityScore">([^<]+)</)[1].replace(/[\s]+/, ''));
                            let scoreInt = parseInt(score.replace(/[^\d]+/g, ''));
                            users[ownerId] = {
                                's' : scoreInt,
                                'e' : now + this._expireForUserScores(scoreInt),
                                'h' : _.trim(score)
                            };

                            done();
                        });

                        return;
                    }
                }
            }

            done();
        });
    }

    _expireForUserScores(score) {
        if (score < 10000) {
            return 300;
        }

        if (score < 100000) {
            return 600;
        }

        if (score < 1000000) {
            return 1800;
        }

        return 43200;
    }

    clearExpiredUsers(){
        let now = Math.floor(_.now() / 1000) - 3;
        let users = Utils.getItem('users') || {};
        _.each(users, (u, k) => {
             if (u.e < now) {
                 delete users[k];
             }
        });

        Utils.setItem('users', users, 86400);
    }

    recalcWidth(index) {
        let w = 9;
        let obj = $(`#js_cityLocation${index}TitleScroll`);
        $(obj).find('div').each(function() {
            w += parseInt($(this).width());
        });

        $(obj).css({width: w, left: 55 - w / 2});
    }

}


module.exports = Island; });;
require.toCache('/js/page/bg/worldmap_iso.js', function(require,module,exports) { 'use strict';

const ISLANDS = require('../../helper/db.js').getIslands();
const Parent = require('./dummy.js');
class World extends Parent {
    init() {
        if (this.options.get('world_search_island', true)) {
            this.searchIslands = this.createModule('worldmap-islandSearch');
        }

        this.sentEmptyIslands = {};
        this.islandsTimeTravel();
        this.updateIkalogsMap();
    }

    mapChanged() {
        this.updateIkalogsMap();
    }

    updateIkalogsMap() {

        let cities = $('#map1 .islandTile .cities');
        let emptyIslands = [];
        _.each(cities, ($el) => {
            $el = $($el);
            let cnt = parseInt($el.text().trim());
            if ((!isNaN(cnt)) && (cnt === 0)) {
                let m = $el.parent().attr('title').trim().match(/\[([0-9]+):([0-9]+)\]/);
                if ((m) && (m.length)) {
                    let islandId = ISLANDS[m[1]][m[2]][0];

                    if (!this.sentEmptyIslands[islandId]) {
                        emptyIslands.push(islandId);
                        this.sentEmptyIslands[islandId] = true;
                    }
                }
            }
        });

        if (emptyIslands.length) {
            let Ikalogs = require('../../helper/ikalogsRu.js');
            Ikalogs.sendWorldEmptyIslands(emptyIslands);
        }
    }


    islandsTimeTravel() {
        $('.islandTile, #mapCoordInput .submitButton').on('click', () => {
            this.showTravelTime();
        });

        this.showTravelTime();
    }

    showTravelTime(){
        let $el = $('#ikaeasy_islands_travel_time');

        if (!$el.length) {
            $el = $('<div id="ikaeasy_islands_travel_time"></div>');
            $('#mapCoordInput').prepend($el);
        }

        setTimeout(() => {
            let activeIsland = this.getActiveIsland();
            let targetIsland = this.getWorldActiveIsland();

            if ((targetIsland.x === activeIsland.x) && (targetIsland.y === activeIsland.y)) {
                $el.html('00:10');
                return;
            }

            let x = targetIsland.x - activeIsland.x;
            let y = targetIsland.y - activeIsland.y;
            let math = 1200 * Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));

            $el.html(Utils.secondToTime(math));
        }, 400);
    }

    getActiveIsland(){
        let res = $('#js_citySelectContainer a').text().split(' ');

        if (typeof res !== 'undefined') {
            res = res[0].split(':');

            return {
                x: Utils.getInt(res[0]),
                y: Utils.getInt(res[1])
            };
        }

        return null;
    }

    getWorldActiveIsland(){
        return {
            x: Utils.getInt($('#inputXCoord').val()),
            y: Utils.getInt($('#inputYCoord').val())
        };
    }

}

module.exports = World; });;
require.toCache('/js/page/tpl/abolishCity.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.checkAllow();
    }

    checkAllow() {
        if (!this.options.get('prevent_accidental_colony_destruction', true)) {
            return;
        }

        let cityId = this.getCityId();
        let palace = _.find(this._data.city.position, (v) => {
            if (v.name) {
                let building = v.building.replace('constructionSite', '').trim();
                if (['palace', 'palaceColony'].indexOf(building) > -1) {
                    return true;
                }
            }
        });

        if (palace) {
            Utils.execute_js(`ikariam.TemplateView.destroyTemplateView(); BubbleTips.bindBubbleTip(1, 11, "${LANGUAGE.getLocalizedString('alert.destroy_non_mobile_colony_prompt')}");`);
        }
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/academy.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this._city.set('scientists', ~~Utils.getFloat($('#js_academy_research_tooltip_basic_production').text()) );
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/barbarianVillage.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        let list = ['resource', 'tradegood1', 'tradegood2', 'tradegood3', 'tradegood4'];
        let sum = 0;
        _.each(list, (v) => {
            sum += this.getGoods(v);
        });

        let ships = Math.ceil(sum / 500);
        $('.barbarianCityKingSpeech').html(this.render('barbarianVillage.ejs', {sum: sum, ships: ships}));
    }

    getGoods(id) {
        return parseInt($(`#js_islandBarbarianResource${id}`).html().replace(/[^0-9]+/g, ''));
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/barracks.js', function(require,module,exports) { 'use strict';

const RESOURCES_LIST = [Resources.CITIZENS, Resources.WOOD, Resources.SULFUR, Resources.WINE, Resources.GLASS];
const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('.premiumOffer').closest('.contentBox01h'), '#premium_btn2']);
        this.prepare();

        this.updateUnitCount();
        this.checkRecruiting();
    }

    checkRecruiting() {
        let $container = $('#unitConstructionList');

        if (!$container.length) {
            Front.ikaeasyData.getCurrentCity().military.setTraining('units', []);
            return;
        }

        let units = [];
        let time = Utils.parseTimeString($container.find('#buildCountDown').text().trim());

        units.push({
            time: _.now() + time,
            type: 'units',
            units: this._checkRecruitingWrapper($container)
        });

        _.each($container.find('> .constructionBlock'), ($block) => {
            $block = $($block);
            let time = Utils.parseTimeString($block.find('> h4 span').text().trim());

            units.push({
                time: _.now() + time,
                type: 'units',
                units: this._checkRecruitingWrapper($block)
            });
        });

        Front.ikaeasyData.getCurrentCity().military.setTraining('units', units);
    }

    _checkRecruitingWrapper($container) {
        let result = {};

        _.each($container.find('> .army_wrapper'), ($w) => {
            $w = $($w);
            let m = $w.find('.army').attr('class').match(/\bs([0-9]+)/);

            if ((m) && (m.length)) {
                let unit = m[1];
                result[UnitIds[unit]] = Utils.getInt($w.find('.unitcounttextlabel').text().trim());
            }
        });

        return result;
    }
    
    updateUnitCount() {
        let military = this._city.military;
        function update(type, cnt) {
            military.setCount(type, Utils.getInt(cnt));
        }

        _.each($('#units li.unit'), ($li) => {
            $li = $($li);
            let unit = $li.attr('class').replace('unit', '').trim();
            update(unit, $li.find('.scroll_view').text());
        });
    }

    prepare() {
        if (this.options.get('units_max', true)) {
            this.addMaxValue();

            $('.forminput input.textfield').on('change input', (e) => {
                let $el = $(e.currentTarget);
                this.updateMaxUnits();
            });

            $('.sliderinput').mouseup((e) => {
                let $el = $(e.currentTarget);
                this.updateMaxUnits();
            });
        }
    }

    _getResourceForUnit(type, $resources) {
        let resource = $resources.find(`li.${type}`);
        if (resource.length) {
            return Utils.getInt(resource.text());
        }

        return null;
    }

    addMaxValue() {
        this.cityResources = this._city.resources;
        this.resources = [];

        _.each($('ul#units li.unit'), (el) => {
            let $el = $(el);
            let $resources = $('ul.resources', $el);

            let unit = {};
            _.each(RESOURCES_LIST, (type) => {
                unit[type] = this._getResourceForUnit(type, $resources);
            });

            this.resources.push(unit);
        });

        this.updateMaxUnits();
    }

    updateMaxUnits(){
        let currentUnitsCosts = {
            [Resources.CITIZENS] : 0,
            [Resources.WOOD]     : 0,
            [Resources.SULFUR]   : 0,
            [Resources.WINE]     :  0,
            [Resources.GLASS]    : 0
        };

        let $units = $('ul#units li.unit');
        _.each($units, (el, index) => {
            let cnt = Utils.getInt($('div.forminput input', el).val());
            if (!cnt) {
                return;
            }

            _.each(currentUnitsCosts, (v, k) => {
                currentUnitsCosts[k] += cnt * this.resources[index][k];
            });
        });

        _.each($units, (el, index) => {
            let max = 99999999999;
            let cnt = Utils.getInt($('div.forminput input', el).val());

            _.each(RESOURCES_LIST, (type) => {
                let unit = this.resources[index];
                if (unit[type] !== null) {
                    let cityRes = this.cityResources[type] - currentUnitsCosts[type] + cnt * unit[type];
                    if (cityRes <= 0) {
                        max = 0;
                    } else {
                        max = Math.min(max, Math.floor(cityRes / unit[type]));
                    }
                }
            });

            let $btn = $('.forminput > .textfieldContainer > a', el);
            if ($btn.length) {
                $btn.addClass('ikaeasy_barracks_max').html(` / ${max}`);
                $btn.off('click').click((e) => {
                    e.preventDefault();

                    if (max > 0) {
                        $('div.forminput input', el).val(max).click();
                        this.updateMaxUnits();
                    }
                });
            }
        });
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/blockade.js', function(require,module,exports) { 'use strict';

const Parent = require('./plunder.js');
class Page extends Parent {

    init() {
        this.addButtons();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/buildingGround.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        $('#buildingGround #buildings li.building:not(.notResearched) .cannotbuild > a').each((k, el) => {
            let $a = $(el);
            let p = $a.parent().html().replace(/[()]+/g, '');
            $a.parent().addClass('ikaeasy-cannotbuild').html(p);
        });

        this.ikariamPremiumToggle([$('#buildingGround #buildings li.building:not(.notResearched) .cannotbuild > a')]);
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/cityDetails.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {
    init() {
        this.addMarker('ally');
        this.addMarker('player');
    }

    addMarker(type = 'ally') {
        $(`#${type}MarkerMenu`).remove();
        $(`#ikaeasy_${type}_marker_btn`).remove();
        $('body').off('.page');

        if (type === 'ally' && $('#js_selectedCityAllyName').text() === '-') {
            return;
        }

        let targetName;
        let btnTarget;
        
        switch(type) {
            case 'ally':
                targetName = '#js_selectedCityAllyName';
                btnTarget = '#js_selectedCityAlly';
                break;
            case 'player':
                targetName = '#js_selectedCityOwnerName';
                btnTarget = '.owner.alt';
                break;
        }

        const marker = require('../../helper/marker.js');
        const $markerMenu = $(this.render('marker.ejs', {id: type}));
        $('body').append($markerMenu);

        let self = this;
        let cityColors = marker.colors.map((v) => { return `marker_${v}`; });
        _.each(cityColors, (mcolor, i) => {
            let color = mcolor.replace('marker_', '');
            let $city = $(`<div class="ikaeasy_marker_ally_list"><div class="cityBox ${mcolor}" id="${mcolor}" /></div>`);
            $markerMenu.append($city);

            $city.find('.cityBox').click(function() {
                marker.setColor($(targetName).text(), color, type === 'ally' ? true : false);
                Front.page_bg.colorizeIt(type);
                $markerMenu.removeClass('show');
                self.addMarker(type);
            });

            let allysByColor = marker.name[ color ];
            _.each(allysByColor, (ally) => {
                let $delP;
                if (type === 'ally' && ally.endsWith('_ally')) {
                    ally = ally.replace('_ally', '');
                    $delP = $(`<p class="markerAllys">${ally}</p>`);
                    $delP.click(function() {
                        marker.deleteName(`${ally}_ally`, true);
                        $(this).remove();
                        Front.page_bg.colorizeIt('ally', $('#js_selectedCityAllyName').text());
                        self.addMarker();
                    });

                    $city.append($delP);
                }
                if (type === 'player' && !ally.endsWith('_ally')) {
                    $delP = $(`<p class="markerAllys">${ally}</p>`);
                    $delP.click(function(e) {
                        marker.deleteName(ally);
                        $(this).remove();
                        Front.page_bg.colorizeIt('player', e.target.textContent);
                        self.addMarker(type);
                    });

                    $city.append($delP);
                }
            });
        });

        let $markerBtn = $(`<span id="ikaeasy_${type}_marker_btn"></span>`);
        $(btnTarget).find('.icons').append($markerBtn);

        $markerBtn.click(function(e) {
            const playerMenu = $('#playerMarkerMenu');
            const allyMenu = $('#allyMarkerMenu');

            if (!$markerMenu.hasClass('show')) {
                if (playerMenu) {
                    playerMenu.removeClass('show');
                }
                if (allyMenu) {
                    allyMenu.removeClass('show');
                }
                let position = $('#sidebar').position();
                $markerMenu.addClass('show').offset({left: position.left + 230, top: position.top + 19});
            } else {
                $markerMenu.removeClass('show');
            }
        });

        $(document).on('keyup.page', function(e) {
            if (e.keyCode === 27) {
                $markerMenu.removeClass('show');
            }
        });

        $('body').on('mouseup.page', function(e) {            
            const type = e.target.id.split('_')[1];
            const $menu = $(`#${type}MarkerMenu`);
            if ([`ikaeasy_${type}_marker_btn`, `${type}MarkerMenu`].indexOf(e.target.id) === -1) {
                $menu.removeClass('show');
                return;
                $('body').off('mouseup.page');
            }
        });
    }

    destroy() {
        $('#allyMarkerMenu').remove();
        $('#playerMarkerMenu').remove();
        $('#ikaeasy_ally_marker_btn').remove();
        $('#ikaeasy_user_marker_btn').remove();
        $('body').off('.page');
        $(document).off('.page');
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/cityMilitary.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.updateUnitCount();
    }

    updateUnitCount() {
        let military = this._city.military;
        function update(type, $unit) {
            military.setCount(type, Utils.getInt($unit.text()));
        }

        let $tds = $('#tabUnits .militaryList .count td');

        update(Military.HOPLITE,           $tds.eq(1));
        update(Military.STEAM_GIANT,       $tds.eq(2));
        update(Military.SPEARMAN,          $tds.eq(3));
        update(Military.SWORDSMAN,         $tds.eq(4));
        update(Military.SLINGER,           $tds.eq(5));
        update(Military.ARCHER,            $tds.eq(6));
        update(Military.GUNNER,            $tds.eq(7));
        update(Military.BATTERING_RAM,     $tds.eq(8));
        update(Military.CATAPULT,          $tds.eq(10));
        update(Military.MORTAR,            $tds.eq(11));
        update(Military.GYROCOPTER,        $tds.eq(12));
        update(Military.BALLOON_BOMBADIER, $tds.eq(13));
        update(Military.COOK,              $tds.eq(14));
        update(Military.DOCTOR,            $tds.eq(15));
        //update(Military.SPARTAN,           $tds.eq(16));

        // === SHIPS ===
        $tds = $('#tabShips .militaryList .count td');

        update(Military.FLAME_THROWER,     $tds.eq(1));
        update(Military.STEAM_RAM,         $tds.eq(2));
        update(Military.RAM_SHIP,          $tds.eq(3));
        update(Military.CATAPULT_SHIP,     $tds.eq(4));
        update(Military.BALLISTA_SHIP,     $tds.eq(5));
        update(Military.MORTAR_SHIP,       $tds.eq(6));
        update(Military.ROCKET_SHIP,       $tds.eq(7));
        update(Military.SUBMARINE,         $tds.eq(8));
        update(Military.PADDLE_SPEED_SHIP, $tds.eq(10));
        update(Military.BALLOON_CARRIER,   $tds.eq(11));
        update(Military.TENDER,            $tds.eq(12));
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/colonize.js', function(require,module,exports) { 'use strict';

const Parent = require('./transport.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle(['#moveCity']);

        if ($('#createColony').data('updated')) {
            return;
        }

        $('#createColony').data('updated', true);
        this.moveTransportBtn($('#transport .resourceAssign'));
        this.updateMinMaxButtons($('#transport'));

        $('#transport').addClass('ikaeasy-transport-wrap');
        this.updateMovements();
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/culturalPossessions_assign.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        $('#moveCulturalGoods ul li input').each(function(index, item) {
            let $item = $(item);
            let id = $item.attr('id').match(/textfield_city_(\d+)/)[1];
            let city = this._ieData.getCity(id);

            this._ieData.getCity(id).set('culturalGoods', parseInt($item.val()));
        });
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/defendCity.js', function(require,module,exports) { 'use strict';

const Parent = require('./plunder.js');
class Page extends Parent {

    init() {
        this.addButtons();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/defendPort.js', function(require,module,exports) { 'use strict';

const Parent = require('./plunder.js');
class Page extends Parent {

    init() {
        this.addButtons();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/deployment.js', function(require,module,exports) { 'use strict';

const Parent = require('./plunder.js');
class Page extends Parent {

    init() {
        this.addButtons();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAdvisor.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
const CacheService = require("../../helper/cache.js");
class Page extends Parent {

    init(){
        this.cache = CacheService.getModuleCache('diplomacyAdvisor');
        this.lazyload = [];
        this.$parent = $(document.getElementById("tab_diplomacyAdvisor"));
        if (this.options.get('diplomacy_links', true)) {
            this.makeActiveLinks()
        }

        if (this.options.get('diplomacy_tab_members', true)) {
            this.addMembersTab();
            this.changeTabsText();
        }

        this.ikariamPremiumToggle([$('.templateView .premiumAccount').closest('.contentBox01h'), $('.templateView .ambrosia, .templateView .chargeAmbrosia')]);
    }

    //Изменение названий закладок
    changeTabsText() {
        let tabs = {
            '.tab_diplomacyAdvisor'     : LANGUAGE.getLocalizedString('diplomacy_message'),
            '.tab_diplomacyIslandBoard' : LANGUAGE.getLocalizedString('diplomacy_agora'),
            '.tab_diplomacyTreaty'      : LANGUAGE.getLocalizedString('diplomacy_treaty'),
            '.tab_diplomacyAlly'        : LANGUAGE.getLocalizedString('diplomacy_alliance')
        };

        _.each(tabs, (text, selector) => {
            let $el = $(selector);
            let m = $el.text().match(/(\(\d+\))/);

            if (m && m.length >= 2) {
                text += ` ${m[1]}`;
            }

            $el.text(text);
        });
    }

    //Добавление вкладки со списком игроков альянса
    addMembersTab() {
        let $tab = $('#js_tab_diplomacyMembers');
        if (!$tab.length) {
            $tab = $(this.render('diplomacy-members.ejs'));
            $('#js_tab_diplomacyAlly').after($tab);
        }

        if (($('#diplomacyAllyMemberlist').length > 0) && $(".filter.diplomacy .filterEntry:first-child:not(.active)")) {
            $tab.addClass('selected').siblings().removeClass('selected');
        }
    }

    checkIfCached(key, action){
        if(!(key in this.cache)){
            this.cache[key] = action();
        }
        return this.cache[key];
    }

    
    //Создание активных ссылок
    makeActiveLinks() {console.log('ss');
        const $messages = this.$parent.find('#deleteMessages .table01');
        const regExpUrl = /(?<!.=[\"'])https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/g;
        const html = $messages.html().replace(regExpUrl, (url) => {
            url = url.toLocaleString();

            // Картинки показываем сразу
            if (/\.(jpe?g|gif|png)$/.test(url)) {
                return this.checkIfCached(url, () => this.render('diplomacy-link-image.ejs', { url: url, img: url }));
            }

            // clip2net - подгружаем и показываем
            if (/https?:\/\/clip2net\.com/.test(url)) {
                if(url in this.cache){
                    return `<div class="ikaeasy_cli2pnet_replace ikaeasy_replace_done">${this.cache[url]}</div>`
                }
                this.lazyload.push(()=>this.setClip2net(url))
                return `<div class="ikaeasy_cli2pnet_replace" data-url="${url}">${url}</div>`
            }

            // ikalogs
            if (/https?:\/\/ikalogs.ru\/report\/.*/.test(url)) {
                const [, , , , battleId] = url.split('/');
                this.lazyload.push(()=>this.ikaLogsReport(battleId, url))
                return `<div class="ikaeasy_ikalogs_replace" data-url="${url}">${url}</div>`
            }

            // Просто ссылка
            return `<a href="${url}" target="_blank" class="externalURL">${_.escape(url)}</a>`;
        });

        // bug: we need to find element again, as until we get here sometimes
        // ikariam updating the dom, so we are not replacing current element, but cached...
        this.$parent.find('#deleteMessages .table01').html(html);
        this.initLazyLoad();

    }

    initLazyLoad(){
        for(const fn of this.lazyload){
            fn();
        }
    }

    async getClip2net(url){
        return new Promise(resolve => {
            chrome.runtime.sendMessage({cmd: 'ajax_html', url: url}, (res) => resolve(res));
        });
    }

    async setClip2net(url){
        if(!(url in this.cache)){
            const res = await this.getClip2net(url);
            const href = '//clip2net.com/'+$(res).find('div.image-pic img').attr('src').replace(/^\//, '');
            this.cache[url] = this.render('diplomacy-link-image.ejs', { url: url, img: href });
        }
        $(`.ikaeasy_cli2pnet_replace[data-url="${url}"]:not(.ikaeasy_replace_done)`).html(this.cache[url]).addClass("ikaeasy_replace_done");
    }

    async ikaLogsReport(battleId, url){
        if(!(url in this.cache)){
            this.cache[url] = 'loading';
            const ikalogsRu = require('../../helper/ikalogsRu.js');
            const { report, users, summary } = await ikalogsRu.getBattleInfo(battleId);
            this.cache[url] = this.render('diplomacy-ikalogs.ejs', { url: url, report, users, summary });
        }
        if(this.cache[url] === 'loading'){
            return;
        }
        $(`.ikaeasy_ikalogs_replace[data-url="${url}"]:not(.ikaeasy_replace_done)`).html(this.cache[url]).addClass("ikaeasy_replace_done");
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAdvisorArchive.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAdvisorArchiveOutBox.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAdvisorOutBox.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAdvisorSearchUser.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#diplomacyAdvisor .premiumAccount').closest('.contentBox01h')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAlly.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAllyInfo.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAllyMemberlist.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyAllySearch.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyIslandBoard.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();

        let $js_msgTextConfirm = $('#js_islandMsgTextInput');
        $js_msgTextConfirm.attr('placeholder', LANGUAGE.getLocalizedString('dummy_message_placeholder'));
        $js_msgTextConfirm.on('keydown', (e) => {
            if ((e.keyCode === 13) && (e.ctrlKey || e.metaKey)) {
                $('#tab_diplomacyIslandBoard input[type="submit"]').click();
            }
        });

        let autoText = Utils.getItem('ikaeasy-msg-to-send');
        if (autoText) {
            $js_msgTextConfirm.val(autoText);
            Utils.removeItem('ikaeasy-msg-to-send');
        }

        $js_msgTextConfirm.focus();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/diplomacyTreaty.js', function(require,module,exports) { 'use strict';

const Parent = require('./diplomacyAdvisor.js');
class Page extends Parent {

    init() {
        super.init();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/dummy.js', function(require,module,exports) { 'use strict';

const Parent = require('../common.js');
class Dummy extends Parent {
    constructor(navigator, name) {
        super();

        this.initBackspace();
        this.init();

        let cb = Utils.getItem('open_building_callback');
        if (cb) {
            Utils.removeItem('open_building_callback');
            if (cb.building === name) {
                let time = 200 + _.random(50, 200);
                setTimeout(() => {
                    if (cb.callback.open === 'empire') {
                        if (navigator.page_bg.empireModule) {
                            navigator.page_bg.empireModule.toggle(true);

                            if (cb.callback.tab) {
                                navigator.page_bg.empireModule.changeTab(cb.callback.tab);
                            }
                        }
                    }
                }, time);
            }
        }
    }

    init() {

    }

    updated() {
        this.init();
    }

    premiumUpdated() {

    }

    refresh() {
        this._data = Front.data;
    }

    initBackspace() {
        let stopBack = false;
        $(document).on('keydown.backspace', (e) => {
            if ((e.keyCode === 8) && (!stopBack)) {
                $('#js_backlinkButton').click();
            }
        });

        $(document).on('focus.backspace', 'input, textarea', () => {
            stopBack = true;
        });

        $(document).on('blur.backspace', 'input, textarea', () => {
            stopBack = false;
        });
    }

    render(tpl, data = {}) {
        const templater = require('../../helper/templater.js');
        return templater.render(tpl, data)
    }

    ikariamPremiumToggle(list) {
        if (!this.options.get('hide_premium', true)) {
            return;
        }

        let $premiumAdvisorSidebar = $('#premiumAdvisorSidebar');
        if ($premiumAdvisorSidebar.length) {
            let $ul = $premiumAdvisorSidebar.closest('ul');
            $premiumAdvisorSidebar.closest('.accordionItem').addClass('ikaeasy-premium-to-hide');

            if ($ul.children().length === 1) {
                $ul.addClass('ikaeasy-premium-to-hide');
            }
        }

        _.each(list, (it) => {
            $(it).addClass('ikaeasy-premium-to-hide');
        });

        let key = Front.tpl;
        let $el = $(`#${key}`).addClass('ikaeasy-premium-wrap');
        if ($el.data('premium-updated')) {
            return;
        }

        let expand = !!Utils.getItem(`toggle-premium-${key}`);
        $el.toggleClass('ikaeasy-hide-premium', !expand);
        $('#sidebar').addClass('ikaeasy-premium-wrap').toggleClass('ikaeasy-hide-premium', !expand);

        let $btn = $('<span class="ikaeasy-premium-btn"></span>');
        $('#js_mainBoxHeaderTitle', $el).append($btn);

        $btn.click(() => {
            expand = !expand;
            Utils.setItem(`toggle-premium-${key}`, expand);
            $el.toggleClass('ikaeasy-hide-premium', !expand);
            $('#sidebar').toggleClass('ikaeasy-hide-premium', !expand);

            Utils.execute_js('ikariam.templateView.mainbox.scrollbar.adjustSize();');
            setTimeout(function() {
                Utils.execute_js('ikariam.templateView.mainbox.scrollbar.adjustSize();');
            }, 200);
        });

        Utils.execute_js('ikariam.templateView.mainbox.scrollbar.adjustSize();');
        $el.data('premium-updated', true);
    }

    destroy() {

    }

    selfDestroy() {
        $(document).off('.backspace');
        this.destroy();
    }
}

module.exports = Dummy; });;
require.toCache('/js/page/tpl/finances.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle(['#js_BadTaxAccountantOffer']);
        this.gold();
        this.updateScientists();
    }

    updateScientists() {
        let scientistCost = 6;
        if (this._ieData.research.has(Research.Science.LETTER_CHUTE)) {
            scientistCost = 3;
        }

        let cities = this._ieData.getOwnCities();
        $('#finances .table01:eq(1) tr').slice(1, -1).each((index, row) => {
            let $tds = $(row).children('td');
            let city = this._ieData.getCity(cities[index]);
            if ($tds.eq(0).text().trim() === city.name) {
                city.set('scientists', Math.round(-Utils.getInt($tds.eq(2).text().replace(',', '')) / scientistCost));
            }
        });
    }

    gold() {
        let $input = $('#ikaeasy_gold_calc');
        if ($input.length > 0) {
            return;
        }

        let goldPerHour = parseInt(this._data.gold.income + this._data.gold.scientistsUpkeep + this._data.gold.upkeep + this._data.gold.badTaxAccountant);
        let template = this.render('finances-gold.ejs', { gold: goldPerHour });
        $('#finances table.upkeepReductionTable:last').append(template);

        $input = $('#ikaeasy_gold_calc');
        $input.on('input', () => {
            let hours = parseInt($input.val());
            if (hours) {
                let calc = Math.abs(hours) * goldPerHour;
                $('#ikaeasy_gold_custom').html(Utils.formatNumber(calc));
            } else {
                $('#ikaeasy_gold_custom').html('&mdash;');
            }
        });

        Utils.execute_js('ikariam.templateView.mainbox.scrollbar.adjustSize();');
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/highscore.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        $('#tab_highscore input[name="searchUser"]').focus();
        this.marker();
    }

    marker() {
        const marker = require('../../helper/marker.js');

        function refreshTop() {
            $('.centerButton .button').click();
        }

        _.each($('.highscore tr'), ($tr) => {
            $tr = $($tr);
            if ($tr.data('updated')) {
                return;
            }

            $tr.data('updated', true);
            if (($tr.hasClass('own')) || ($tr.hasClass('ownally'))) {
                return;
            }



            let $markerMenu = $('<div class="ikaeasy_top_marker_menu" title=""></div>');
            $tr.append($markerMenu);

            let colors = ['blank'].concat(marker.colors);
            _.each(colors, (color) => {
                let $menuCell = $(`<div class="ikaeasy_top_menuCell" data-color="${ color }" title=""></div>`);
                $markerMenu.append($menuCell);

                $menuCell.click(() => {
                    let $ally = $('.ikaeasy_marker_big', $tr);

                    if (color === 'blank') {
                        marker.deleteName($ally.data('name'));
                    } else {
                        marker.setColor($ally.data('name'), color);
                    }

                    $markerMenu.removeClass('show');
                    setTimeout(refreshTop, 500);
                });
            });


            const allyTag = $('.allytag a', $tr).text().trim();
            const userName = $('.name a', $tr).text().trim();
            // if (!allyTag) {
            //     return;
            // }

            const $marker = $(`<div class="ikaeasy_marker_big" data-ally="${ allyTag }" data-name="${ userName }"></div>`);
            $('.action a', $tr).before($marker);
            $marker.off('click').on('click', (e) => {
                $('.ikaeasy_top_marker_menu', $tr).toggleClass('show');
            });

            for(const color in marker.name){
                const list = marker.name[color];
                if(list.indexOf(userName) > -1){
                    $tr.addClass(`marker_top_${color}`);
                    return true;
                }else if(list.indexOf(allyTag+'_ally') > -1){
                    $tr.addClass(`marker_top_${color}`);
                    return true;
                }
            }
        });
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/highscoreAlly.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        $('#tab_highscoreAlly input[name="searchAlliance"]').focus();
        this.marker();
    }

    marker() {
        let marker = require('../../helper/marker.js');
        function refreshTop() {
            $('.centerButton .button').click();
        }

        _.each($('.highscore tr'), ($tr) => {
            $tr = $($tr);
            if ($tr.data('updated')) {
                return;
            }

            $tr.data('updated', true);
            if (($tr.hasClass('own')) || ($tr.hasClass('ownally'))) {
                return;
            }

            let $markerMenu = $('<div class="ikaeasy_top_marker_menu" title=""></div>');
            $tr.append($markerMenu);

            let colors = ['blank'].concat(marker.colors);
            _.each(colors, (color) => {
                let $menuCell = $(`<div class="ikaeasy_top_menuCell" data-color="${ color }" title=""></div>`);
                $markerMenu.append($menuCell);

                $menuCell.click(() => {
                    let $ally = $('.ikaeasy_marker_big', $tr);

                    if (color === 'blank') {
                        marker.deleteName($ally.data('ally') + '_ally');
                    } else {
                        marker.setColor($ally.data('ally'), color, true);
                    }

                    $markerMenu.removeClass('show');
                    setTimeout(refreshTop, 500);
                });
            });


            let allyTag = $('.name', $tr).text().trim();
            console.log(allyTag);
            allyTag = allyTag .substring(allyTag.indexOf('(') + 1, allyTag.indexOf(')')).trim();

            let $marker = $(`<div class="ikaeasy_marker_big" data-ally="${ allyTag }"></div>`);
            $('.action a', $tr).before($marker);
            $marker.click((e) => {
                $('.ikaeasy_top_marker_menu', $tr).toggleClass('show');
            });

            for(const color in marker.name){
                const list = marker.name[color];
                if(list.indexOf(allyTag+'_ally') > -1){
                    $tr.addClass(`marker_top_${color}`);
                    return true;
                }
            }
        });
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/ignoreList.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#diplomacyAdvisor .premiumAccount').closest('.contentBox01h')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/militaryAdvisor.js', function(require,module,exports) { 'use strict';

const ISLANDS = require('../../helper/db.js').getIslands();
const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        setTimeout(() => {
            if (this.options.get('military_movements', true)) {
                this.movementView();
            }

            this.updateMovements();
        }, 100);

        this.ikariamPremiumToggle([$('#militaryAdvisor .premiumAccount').closest('.contentBox01h')]);
    }

    movementView(){
        const db = require('../../helper/db.js').db();
        let $table = $('#js_MilitaryMovementsFleetMovementsTable table');

        if ($table.data('updated')) {
            return;
        }

        $table.data('updated', true);
        $table.find('td').each(function() {
            $(this).css('padding', '4px 0px').removeClass('right');
        });

        // Отображение войск и флотов в военном советнике.
        _.each($table.find('tr').has('td'), ($tr) => {
            $tr = $($tr);

            if (($tr.find('.ikaeasy_transport_main').length) || (!$tr.find('.mission_icon').length)) {
                return;
            }

            let mission = $tr.find('.mission_icon').attr('class').replace('mission_icon', '').trim();
            let total = 0;
            let res_count = 0;
            let $wrapper = $('<div class="ikaeasy_transport_main"></div>');

            if ($('.unit_detail_icon', $tr).length) {
                _.each($('.unit_detail_icon', $tr), (icon) => {
                    let $icon = $(icon);
                    if ($icon.is('.resource_icon:not(.gold)')) {
                        total += Utils.getInt($icon.text());
                        res_count++;
                    }
                    
                    $wrapper.append($icon);
                });
                
                if ((total) && (res_count)) {
                    $wrapper.append(this.render('military-unit-detail.ejs', {total: total, db: db}));
                }

                $('td', $tr).eq(3).empty().append($wrapper).attr('colspan', '2');
                $('td', $tr).eq(4).remove();
            }

            if (mission === 'piracyRaid') {
                $('td', $tr).eq(3).empty().attr('colspan', '2');
                $('td', $tr).eq(4).remove();
            }
        });

        _.each($('#js_MilitaryMovementsFleetMovementsTable .military_event_table tr'), ($tr) => {
            $tr = $($tr);

            if ($('td', $tr).eq(3).attr('colspan') !== '2') {
                let $td = $('td', $tr).eq(3);
                $td.html(`<div class="ikaeasy_transport_main_fix">${$td.html()}</div>`);
                $('td', $tr).eq(4).css('padding', '4px 10px');
            }
        });
    }

    updateMovements() {
        let activeMovements = {};
        if (!Front.viewData) {
            return;
        }

        _.each(Front.viewData.militaryAndFleetMovements, (mov, index) => {
            let stageTime = mov.eventTime * 1000;

            // Ищем movement подходящий по параметрам
            let movement = _.find(this._ieData.movements, (m) => {
                if (m.id === mov.event.id) {
                    return true;
                }

                if (m.id > 0) {
                    return false;
                }

                if ((m.originCityId !== mov.origin.cityId) || ((m.targetCityId) && (m.targetCityId !== mov.target.cityId)) || (m.transports !== mov.fleet.amount) || (m.mission !== mov.event.missionIconClass)) {
                    return false;
                }

                let stage = m.getStage();
                if ((stage) && (Math.abs(stage.finishTime - stageTime) < 5000)) {
                    return true;
                }
            });

            if (movement) {
                movement.stages = _.filter(movement.stages, (v) => {
                    if (v.time + movement.startTime > _.now()) {
                        return true;
                    }
                });

                movement.id = mov.event.id;

                movement.originCityId   = mov.origin.cityId;
                movement.originCityName = mov.origin.name;
                movement.targetCityId   = mov.target.cityId;
                movement.targetCityName = mov.target.name;

                if ((mov.event.isFleetReturning) && (movement.getStage().stage !== Movements.Stage.RETURNING)) {
                    movement.startTime = _.now();
                    movement.stages = [];
                    movement.addStage(Movements.Stage.RETURNING, mov.eventTime * 1000 - _.now());

                    if (movement.mission === Movements.Mission.TRADE) {
                        movement.resources = {};
                        movement.resources[Resources.WOOD]   = 0;
                        movement.resources[Resources.WINE]   = 0;
                        movement.resources[Resources.MARBLE] = 0;
                        movement.resources[Resources.GLASS]  = 0;
                        movement.resources[Resources.SULFUR] = 0;

                        _.each(mov.resources, (r) => {
                            let name = r.cssClass.replace('resource_icon', '').trim();
                            if (name !== 'gold') {
                                movement.resources[name] = Utils.getInt(r.amount);
                            }
                        });

                        // Обновляем список ресурсов
                    }
                }

                Front.ikaeasyData.save();

                activeMovements[movement.id] = true;
            } else {
                // Такой Movement не найден, попробуем создать его
                if ([Movements.Mission.TRADE, Movements.Mission.TRANSPORT].indexOf(mov.event.missionIconClass) === -1) {
                    // Мисия не найдена в поддерживаемых
                    return;
                }

                let data = {
                    id: mov.event.id,
                    type: (mov.isOwnArmyOrFleet) ? 'own' : 'hostile',
                    mission: mov.event.missionIconClass,

                    originCityId   : mov.origin.cityId,
                    originCityName : mov.origin.name,
                    targetCityId   : mov.target.cityId,
                    targetCityName : mov.target.name,

                    transports: mov.fleet.amount,
                    isColonize: (mov.event.mission === Movements.MissionId.COLONIZE),
                    units: null,
                    resources: {},
                    stages: []
                };

                data.resources[Resources.WOOD]   = 0;
                data.resources[Resources.WINE]   = 0;
                data.resources[Resources.MARBLE] = 0;
                data.resources[Resources.GLASS]  = 0;
                data.resources[Resources.SULFUR] = 0;

                let totalResources = 0;
                _.each(mov.resources, (r) => {
                    let name = r.cssClass.replace('resource_icon', '').trim();
                    if (name !== 'gold') {
                        data.resources[name] = Utils.getInt(r.amount);
                        totalResources += data.resources[name];
                    }
                });

                let speed = 1;
                _.each([500, 400, 300, 200, 100], (v, k) => {
                    let needTransports = Math.ceil(totalResources / v);
                    if (needTransports === data.transports) {
                        speed = 1 + k * (1 / 6)
                    }
                });

                const Movement = require('../../data/movement.js');
                let movement = new Movement(data);

                switch (mov.event.missionState) {
                    case Movements.MissionState.LOADING: // Погрузка
                        movement.addStage(Movements.Stage.LOADING, mov.eventTime * 1000 - _.now());
                        movement.addStage(Movements.Stage.EN_ROUTE, this.getTravelTime(mov.origin.islandId, mov.target.islandId) * speed);
                        break;

                    case Movements.MissionState.EN_ROUTE: // В пути
                        movement.addStage(Movements.Stage.EN_ROUTE, mov.eventTime * 1000 - _.now());
                        break;
                }

                Front.ikaeasyData.addMovement(movement);
                activeMovements[movement.id] = true;
            }
        });


        // Удаляем те движения которых нет в списке
        if ($('#militaryMovementsFleetMovementsFilters [data-filter="all"].selected').length) {
            let ids = this._ieData.movements.map((v) => { return v.id; });
            _.each(ids, (id) => {
                if (!activeMovements[id]) {
                    Front.ikaeasyData.removeMovement(id);
                }
            });
        }
    }

    getTravelTime(islandId1, islandId2) {
        let island1 = this.findIsland(islandId1);
        let island2 = this.findIsland(islandId2);
        if ((island1.x === island2.x) && (island1.y === island2.y)) {
            return 600000;
        }

        let x = island1.x - island2.x;
        let y = island1.y - island2.y;
        let math = 1200 * Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
        return math * 1000;
    }

    findIsland(islandId) {
        let islandX = null;
        let islandY = null;
        let isFinded = false;
        _.each(ISLANDS, (xx, x) => {
            _.each(xx, (island, y) => {
                if (island[0] === islandId) {
                    isFinded = true;
                    islandX = x;
                    islandY = y;
                    return false;
                }
            });

            if (isFinded) {
                return false;
            }
        });

        return {x: islandX, y: islandY};
    }

    destroy() {
        this._movementInterval && clearInterval(this._movementInterval);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/militaryAdvisorCombatList.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#militaryAdvisor .premiumAccount').closest('.contentBox01h')]);

        this.addIkalogIcons();
    }

    addIkalogIcons() {
        if ($('#combatList').data('updated')) {
            return;
        }
        $('#combatList').data('updated', true);
        let battles = Utils.getItem('battles') || {};

        _.each($('#combatList tbody tr'), ($tr) => {
            $tr = $($tr);

            let rep_date = $tr.find('.date').text().trim();
            let $tdr = $tr.find('.subject');
            let rep_id = $tdr.attr('onclick').match(/combatId=([0-9]+)/)[1];
            $tdr.after(`<td class="subject">${$tr.find('.subject').html()}</td>`);
            $tdr.remove();
            let $td = $tr.find('.subject');

            if (battles[rep_id]) {
                let $a = $(`<a href="${battles[rep_id].ikalogs}" target="_blank" class="ikaeasy_icon_ikalogs"></a>`);
                if (rep_date !== battles[rep_id].date) {
                    $a.addClass('ikaeasy_icon_ikalogs_old');
                }

                $td.prepend($a);
            }
        });
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/militaryAdvisorReportView.js', function(require,module,exports) { 'use strict';

const Ikalogs = require('../../helper/ikalogs.js');
const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        if ($('#ikalogs_saver').length) {
            return;
        }

        if ($('#troopsReport .attacker').length) {
            this.ikalogs = new Ikalogs(this._data.avatarId);
        }

        this.ikariamPremiumToggle([$('#militaryAdvisor .premiumAccount').closest('.contentBox01h')]);
        this.initChecker();
    }

    updated() {

    }

    initChecker() {
        if (this.interval) {
            return;
        }

        let cnt = 0;
        this.interval = setInterval(() => {
            this.init();

            if (++cnt > 5) {
                clearInterval(this.interval);
            }
        }, 100);
    }

    destroy() {
        clearInterval(this.interval);

        if ($('#ikalogs_saver').length) {
            $('#ikalogs_saver').closest('ul').remove();
        }
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/militaryAdvisorWarList.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#militaryAdvisor .premiumAccount').closest('.contentBox01h')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/museum.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        let culturalGoods = Utils.getInt($('#val_culturalGoodsDeposit').parent().text());
        this._city.set('culturalGoods', culturalGoods);
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/occupy.js', function(require,module,exports) { 'use strict';

const Parent = require('./plunder.js');
class Page extends Parent {

    init() {
        this.addButtons();
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/options.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.addTab();
        this.$page = $('#tab_options');
    }

    addTab() {
        let $tab = $('#js_tab_ikaeasy');
        if (!$tab.length) {
            $tab = $(this.render('options-tab.ejs'));
            $tab.click(() => {
                this.selectTab();
            });
            $('#js_tab_options').after($tab);
        }
    }

    selectTab() {
        $('#js_tab_ikaeasy').addClass('selected').siblings().removeClass('selected');
        this.$page.html(this.render('options-page.ejs', { list: this.options.getList(), options: this.options }));

        this.$page.find('input[type="checkbox"]').change((e) => {
            let $input = $(e.currentTarget);
            let name = $input.attr('name');

            this.options.set(name, $input.prop('checked'));
        });

        Utils.execute_js('ikariam.templateView.mainbox.scrollbar.adjustSize();');
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/optionsAccount.js', function(require,module,exports) { 'use strict';

const Parent = require('./options.js');
class Page extends Parent {

    init() {
        super.init();
        this.$page = $('#tab_optionsAccount');
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/optionsIPSharing.js', function(require,module,exports) { 'use strict';

const Parent = require('./options.js');
class Page extends Parent {

    init() {
        super.init();
        this.$page = $('#tab_optionsIPSharing');
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/optionsNotification.js', function(require,module,exports) { 'use strict';

const Parent = require('./options.js');
class Page extends Parent {

    init() {
        super.init();
        this.$page = $('#tab_optionsNotification');
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/palace.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        // Обновляем форму правления
        // this._ieData.info.set('government', $('.government_pic img').attr('src').slice(16, -8));
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/plunder.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        if ($('#ikaeasy_max_ships').length) {
            return;
        }

        let $el = $('<div class="ikaeasy_max_btn" id="ikaeasy_max_ships"></div>');
        $('#plusminus').append($el);

        $el.click(() => {
            let cnt = parseInt($('#transporterCount').text());
            $('#extraTransporter').val(this._data.ships - cnt);
            $('#totalFreight').text(this._data.ships * 500);
        });

        this.addButtons();
    }

    addButtons() {
        if (!this.options.get('units_to_ship', true)) {
            return;
        }

        if ($('#ikaeasy_attack_btns_div').length) {
            return;
        }

        let $allBtnDiv = $('<div class="ikaeasy_attack_btns_div ikaeasy-fix-button" id="ikaeasy_attack_btns_div"></div>');

        $allBtnDiv.append(this._nothingButton());
        $allBtnDiv.append(this._halfButton());
        $allBtnDiv.append(this._allButton());

        $allBtnDiv.insertBefore('div.newSummary');
    }

    _allButton() {
        let $allBtn = $(`<a class="button">${LANGUAGE.getLocalizedString('attack_btn_all')}</a>`);
        $allBtn.click(() => {
            _.each($('ul.assignUnits li'), (el) => {
                let $el = $(el);
                let count = Utils.getInt($('.amount', $el).text());
                $('input.textfield', $el).val(count).click();
            });
        });

        return $allBtn;
    }

    _halfButton() {
        //Half button
        let $halfBtn = $(`<a class="button">${LANGUAGE.getLocalizedString('attack_btn_half')}</a>`);
        $halfBtn.click(() => {
            _.each($('ul.assignUnits li'), (el) => {
                let $el = $(el);
                let count = Utils.getInt($('.amount', $el).text());
                $('input.textfield', $el).val(Math.floor(count / 2)).click();
            });
        });

        return $halfBtn;
    }

    _nothingButton() {
        //Half button
        let $nothingBtn = $(`<a class="button">${LANGUAGE.getLocalizedString('attack_btn_nope')}</a>`);
        $nothingBtn.click(() => {
            _.each($('ul.assignUnits li'), (el) => {
                let $el = $(el);
                $('input.textfield', $el).val('0').click();
            });
        });

        return $nothingBtn;
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/port.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.updateMovements();
    }

    updateMovements() {
        let $trs = $('#tabSendTransporter table.table01:eq(0) > tbody > tr');
        _.each($trs, ($tr, index) => {
            $tr = $($tr);

            if ((index === 0) || ($tr.find('td').length < 4)) {
                return;
            }

            let targetCityName = $tr.find('td.destination').text().trim();
            let transports = Utils.getInt($tr.find('td:eq(1) > span').text());
            let time = Utils.parseTimeString($tr.find('td.status .time:eq(0)').text());

            let $cargo = $tr.find('td:eq(1) > .tooltip tr');
            let resources = {};
            if ($cargo.length > 1) {
                let resList = [Resources.WOOD, Resources.WINE, Resources.MARBLE, Resources.SULFUR, Resources.GLASS];

                _.each($cargo, ($ctr, k) => {
                    $ctr = $($ctr);
                    if (k === 0) {
                        return;
                    }

                    let icon = $ctr.find('td:eq(0) img').attr('src').match(/icon_(.*?)\.png/)[1];
                    resources[icon] = Utils.getInt($ctr.find('td:eq(1)').text());
                });
            }

            let eventId = null;
            if ($tr.find('td a.action_icon').length) {
                eventId = parseInt($tr.find('td a.action_icon').attr('href').match(/eventId=([0-9]+)/)[1]);
            }

            // Ищем movement подходящий по параметрам
            let tmpCnt = 0;
            let movement = _.find(this._ieData.movements, (m) => {
                if (m.id === eventId) {
                    return true;
                }

                if ((m.originCityId !== this._city.cityId) || (m.targetCityName !== targetCityName) || (m.transports !== transports)) {
                    return false;
                }

                let stage = m.getStage();
                let stageTime = _.now() + time;
                if ((stage) && (stage.stage === Movements.Stage.LOADING)) {
                    tmpCnt++;
                    if ((eventId) && (m.id > 0)) {
                        return false;
                    }

                    if ((isNaN(time)) && (tmpCnt === index)) {
                        return true;
                    } else if (Math.abs(stage.finishTime - stageTime) < 5000){
                        return true;
                    }
                }
            });

            if ((movement) && (eventId)) {
                movement.stages = _.filter(movement.stages, (v) => {
                    if (v.time + movement.startTime > _.now()) {
                        return true;
                    }
                });

                movement.id = eventId;
                Front.ikaeasyData.save();
            }
        });

        $trs.find('a.action_icon.abort').click((e) => {
            e.preventDefault();
            let $a = $(e.currentTarget);
            let href = $a.attr('href');
            let eventId = parseInt(href.match(/eventId=([0-9]+)/)[1]);

            // Удаляем такой маршрут
            Front.ikaeasyData.removeMovement(eventId);
        });
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/researchAdvisor.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#researchAdvisor .premiumAccount').closest('.contentBox01h'), $('#researchAdvisor .premium_research_link')]);
        this._ieData.getResearch().update(this._data.templateView.params.currResearchType);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/resource.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#resource .premiumOfferBox')]);

        let $li = $('.resUpgrade .resources li');
        let res = $li.eq(0).attr("class");

        if ($(`.resUpgrade .${res}`).length === 2) {
            $('.resUpgrade h4:eq(0)').html(LANGUAGE.getLocalizedString('island_mine_next_level') + ':');
            let need = Utils.getInt($li.eq(0).text());
            let have = Utils.getInt($li.eq(1).text());

            $('div.resUpgrade ul.resources:last').after(this.render('island_mine.ejs', { res: res, have: have, need: need }));
        }
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/safehouse.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle(['#tabReports .archiveButton .ambrosia']);

        _.each($('table.reportTable.resourcesTable'), (el, i) => {
            let $table = $(el);
            this.appendTable($table, i);
        });
    }

    appendTable($table, index) {
        if ($table.data('updated')) {
            return;
        }

        _.each($table.find('tr'), (el, i) => {
            let $el = $(el);
            if (i === 0) {
                $el.append(`<th class="count">${LANGUAGE.getLocalizedString('safehouse_available_steal')}</th>`);
                return;
            }

            $el.addClass('js-resource-row').append(`<td class="count js-resource">0</td>`);
        });

        let $tr = $(this.render('safehouse.ejs'));
        $table.append($tr);

        let $info = $table.closest('tr.report').prev();
        let targetCityId = $info.find('.targetCity a').attr('href').match(/selectCity=([0-9]+)/)[1];
        let levels = Utils.getItem('warehouse-level');
        if ((levels) && (levels[targetCityId] !== undefined)) {
            $tr.find('.js-warehouse').val(levels[targetCityId]);
        }
        
        $tr.find('.js-warehouse').on('input', () => {
            this.refreshResourcesReports($table);
        });

        $tr.find('.js-idle').on('change', () => {
            this.refreshResourcesReports($table);
        });

        this.refreshResourcesReports($table);
        this.getReportInfo($table);
        $table.data('updated', true);
    }

    getReportInfo($table) {
        // Узнаем инфу о репорте
        let storage = {};
        let $info = $table.closest('tr.report').prev();
        let m = $info.find('.targetCity a').attr('href').match(/xcoord=([0-9]+)&ycoord=([0-9]+)&selectCity=([0-9]+)/);
        if (m && m.length) {
            //onclick="toggleElement('tbl_mail97634'); toggleArrow($('#button97634')[0]);"
            storage.ownerId = parseInt($info.find('.targetOwner').attr('onclick').match(/tbl_mail([0-9]+)/)[1]);
            storage.ownerName = $info.find('.targetOwner').text().trim();
            storage.date = $info.find('.date').text().trim();
            storage.coordX = parseInt(m[1]);
            storage.coordY = parseInt(m[2]);
            storage.cityId = parseInt(m[3]);
            storage.cityName = $info.find('.targetCity a').text().replace(/(\[.*?\])/, '').trim();
            storage.resources = {};

            _.each($table.find('tr.js-resource-row'), (el) => {
                let $el = $(el);
                let res = $el.find('.unitname img').attr('src').match(/icon_([a-z]+)\.png/)[1];
                storage.resources[res] = Utils.getInt($el.find('.count:eq(0)').text());
            });
        } else {
            console.error('Cannot parse url', $info.find('.targetCity a').attr('href'))
        }
    }

    refreshResourcesReports($table) {
        let $info = $table.closest('tr.report').prev();
        let targetCityId = $info.find('.targetCity a').attr('href').match(/selectCity=([0-9]+)/)[1];

        let warehouseLevel = Utils.getInt($table.find('.js-warehouse').val());
        Utils.updateObjectItem('warehouse-level', {targetCityId: warehouseLevel});

        let isIdle = $table.find('.js-idle').prop('checked');

        let sum = 0;
        let protectedResource = (isIdle) ? 15 + warehouseLevel * 80 : 100 + warehouseLevel * 480;
        _.each($table.find('tr.js-resource-row'), (el) => {
            let $el = $(el);
            let cnt = Utils.getInt($el.find('.count:eq(0)').text());
            let toStole = Math.max(0, cnt - protectedResource);
            sum += toStole;

            $el.find('.js-resource').html(Utils.formatNumber(toStole));
        });

        $table.find('.js-result-1').html(LANGUAGE.getLocalizedString('safehouse_resources', {SUM: Utils.formatNumber(sum)}));
        $table.find('.js-result-2').html(LANGUAGE.getLocalizedString('safehouse_ships', {SHIPS: Math.ceil(sum / 500)}));
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/sendIKMessage.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        $(document).off('.backspace');

        let $js_msgTextConfirm = $('#js_msgTextConfirm');
        $js_msgTextConfirm.attr('placeholder', LANGUAGE.getLocalizedString('dummy_message_placeholder'));
        $js_msgTextConfirm.on('keydown', (e) => {
            if ((e.keyCode === 13) && (e.ctrlKey || e.metaKey)) {
                $('#js_messageSubmitButton').click();
            }
        });

        let autoText = Utils.getItem('ikaeasy-msg-to-send');
        if (autoText) {
            $js_msgTextConfirm.val(autoText);
            Utils.removeItem('ikaeasy-msg-to-send');
        }

        $js_msgTextConfirm.focus();
    }

    initBackspace() {

    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/shipyard.js', function(require,module,exports) { 'use strict';

const Parent = require('./barracks.js');
class Page extends Parent {

    init() {
        this.prepare();
        this.ikariamPremiumToggle(['#premium_btn2']);
        
        this.updateUnitCount();
        this.checkRecruiting();
    }

    checkRecruiting() {
        let $container = $('#unitConstructionList');

        if (!$container.length) {
            Front.ikaeasyData.getCurrentCity().military.setTraining('ships', []);
            return;
        }

        let units = [];
        let time = Utils.parseTimeString($container.find('#buildCountDown').text().trim());

        units.push({
            time: _.now() + time,
            type: 'ships',
            units: this._checkRecruitingWrapper($container)
        });

        _.each($container.find('> .constructionBlock'), ($block) => {
            $block = $($block);
            let time = Utils.parseTimeString($block.find('> h4 span').text().trim());

            units.push({
                time: _.now() + time,
                type: 'ships',
                units: this._checkRecruitingWrapper($block)
            });
        });

        Front.ikaeasyData.getCurrentCity().military.setTraining('ships', units);
    }

    _checkRecruitingWrapper($container) {
        let result = {};

        _.each($container.find('> .army_wrapper'), ($w) => {
            $w = $($w);
            let m = $w.find('.army').attr('class').match(/\bs([0-9]+)/);

            if ((m) && (m.length)) {
                let unit = m[1];
                result[UnitIds[unit]] = Utils.getInt($w.find('.unitcounttextlabel').text().trim());
            }
        });

        return result;
    }

    updateUnitCount() {
        let military = this._city.military;
        function update(type, cnt) {
            military.setCount(type, Utils.getInt(cnt));
        }

        _.each($('#units li.unit'), ($li) => {
            $li = $($li);
            let unit = $li.attr('class').replace('unit', '').trim();
            update(unit, $li.find('.scroll_view').text());
        });
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/takeOffer.js', function(require,module,exports) { 'use strict';

const Parent = require('./transport.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle(['#setPremiumTransports']);

        this.moveTransportBtn($('#mission .costsTotal'));
        this.addTransportButtons();
        this.updateMovements();
    }

    addTransportButtons() {
        let $container = $('#transportForm');
        if ($container.data('updated')) {
            return;
        }

        if (this.options.get('transport_buttons', true)) {
            $('#transportForm').addClass('ikaeasy-transport-wrap ikaeasy-transport-bnt-no-margin');
            $('#transportForm td.input input').each((index, node) => {
                node = $(node);
                let $a = $('a[href="#setmax"]', node.parent());
                let $box = $(this.render('transport-buttons.ejs', {custom: [{ val: 999999999, text: $a.text() }]}));
                node.after($box);

                $('.ikaeasy_transport_button_trigger', $box).click((e) => {
                    let $el = $(e.currentTarget);
                    this.clickButton(parseInt($el.attr('data-sum')), node)
                });

                $a.remove();
            });
        }

        $container.data('updated', true);
    }

    updateMovements() {
        let $form = $('#transportForm');
        $form.on('submit', () => {
            let elements = $form[0].elements;
            let data = {
                id: -_.now(),
                type: 'own',
                mission: Movements.Mission.TRANSPORT,
                originCityId: this._city.cityId,
                targetCityId : parseInt(elements['destinationCityId'].value),
                transports: Utils.getInt($('#transporterCount').val()) || 0,
                units: null,
                resources: {},
                stages: []
            };


            data.resources[Resources.WOOD]   = Utils.getInt($('#textfield_resource').val())   || 0;
            data.resources[Resources.WINE]   = Utils.getInt($('#textfield_tradegood1').val()) || 0;
            data.resources[Resources.MARBLE] = Utils.getInt($('#textfield_tradegood2').val()) || 0;
            data.resources[Resources.GLASS]  = Utils.getInt($('#textfield_tradegood3').val()) || 0;
            data.resources[Resources.SULFUR] = Utils.getInt($('#textfield_tradegood4').val()) || 0;

            let totalResources = data.resources[Resources.WOOD] + data.resources[Resources.WINE] + data.resources[Resources.MARBLE] + data.resources[Resources.GLASS] + data.resources[Resources.SULFUR];
            let loadingFinished = (totalResources / this._city.getLoadingSpeed() * Time.MILLIS_PER_SECOND);

            const Movement = require('../../data/movement.js');
            let movement = new Movement(data);

            if (elements['function'].value === 'buyGoodsAtAnotherBranchOffice') {
                // Покупка товаров
                movement.mission = Movements.Mission.TRADE;

                // Добавляем сначала стадию EN_ROUTE (сначала сухогрузы пустыми плывут в город за ресурсами)
                movement.addStage(Movements.Stage.EN_ROUTE, Utils.parseTimeString($('#journeyTime').text().trim()));
            } else {
                movement.addStage(Movements.Stage.LOADING, loadingFinished);
            }

            movement.addStage(Movements.Stage.EN_ROUTE, Utils.parseTimeString($('#journeyTime').text().trim()));

            Front.on('form', (response) => {
                Front.off('form');

                if ((!response[3][1]) || (!response[3][1].length) || (!response[3][1][0]) || (response[3][1][0].type !== 10)) {
                    return;
                }

                Front.ikaeasyData.addMovement(movement);
            });
        });
    }

}

module.exports = Page;
 });;
require.toCache('/js/page/tpl/tavern.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {

    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/temple.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        let priests = Utils.getInt($('#inputPriests').val());
        this._city.set('priests', priests);
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/townHall.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#townHall .premiumOffer')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/tradeAdvisor.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#tradeAdvisor .premiumAccount').closest('.contentBox01h')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/tradegood.js', function(require,module,exports) { 'use strict';

const Parent = require('./resource.js');
class Page extends Parent {

    init() {
        super.init();
        this.ikariamPremiumToggle([$('#tradegood .premiumOfferBox')]);
    }

}

module.exports = Page; });;
require.toCache('/js/page/tpl/tradeRoutes.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('#tradeAdvisor .premiumAccount').closest('.contentBox01h')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/transport.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle(['#setPremiumTransports']);

        this.moveTransportBtn($('.minusPlusValueOuterContainer'));
        this.removeIkariamButtons();
        this.updateMinMaxButtons($('#transportGoods'));

        this.updateMovements();
    }

    updateMovements() {
        let $form = $('#transportForm, #transport');
        $form.on('submit', () => {
            let data = {
                id: -_.now(),
                type: 'own',
                mission: Movements.Mission.TRANSPORT,
                originCityId: this._city.cityId,
                originCityName: this._city.name,
                transports: Utils.getInt($('#transporterCount').val()) || 0,
                units: null,
                resources: {},
                stages: []
            };

            if ($form.find('input[name="destinationCityId"]').length) {
                data.targetCityId = parseInt($form.find('input[name="destinationCityId"]').val());
                data.targetCityName = $form.find('.journeyTarget').html().replace(/(<span.*?<\/span>)/, '').trim();
            }

            data.resources[Resources.WOOD]   = Utils.getInt($('#textfield_wood').val())   || 0;
            data.resources[Resources.WINE]   = Utils.getInt($('#textfield_wine').val())   || 0;
            data.resources[Resources.MARBLE] = Utils.getInt($('#textfield_marble').val()) || 0;
            data.resources[Resources.GLASS]  = Utils.getInt($('#textfield_glass').val())  || 0;
            data.resources[Resources.SULFUR] = Utils.getInt($('#textfield_sulfur').val()) || 0;

            if ($('#createColony').length) {
                data.isColonize = true;
                data.resources[Resources.WOOD] += 1250;
            }

            let totalResources = data.resources[Resources.WOOD] + data.resources[Resources.WINE] + data.resources[Resources.MARBLE] + data.resources[Resources.GLASS] + data.resources[Resources.SULFUR];
            let loadingFinished = Utils.parseTimeString($('#loadingTime').text().trim());
            let routeTime = Utils.parseTimeString($('#journeyTime').text().trim());

            Front.on('form', (response) => {
                Front.off('form');

                _.each(response, (r) => {
                     if ((r[0] === 'provideFeedback') && (r[1][0].type === 10)) {
                         const Movement = require('../../data/movement.js');
                         let movement = new Movement(data);
                         movement.addStage(Movements.Stage.LOADING, loadingFinished);
                         movement.addStage(Movements.Stage.EN_ROUTE, routeTime);

                         Front.ikaeasyData.addMovement(movement);
                         return false;
                     }
                });
            });
        });
    }

    moveTransportBtn($container) {
        if ($('#ikaeasy_tranport_btn').length) {
            return;
        }

        let $btn = $('#submit').parent().clone();
        $btn.find('input').attr('id', 'ikaeasy_tranport_btn');

        $container.after($btn);
        $container.after($('#missionSummary'));
        $container.after('<hr/>');
    }

    removeIkariamButtons() {
        if (this.options.get('transport_buttons', true)) {
            $('.minusPlusValueContainer').remove();
            $('#transportGoods').addClass('ikaeasy-transport-wrap');
            $('.button.minus', '.resourceAssign').remove();
            $('.button.plus', '.resourceAssign').remove();
        }
    }

    updateMinMaxButtons($container) {
        if ($container.data('updated')) {
            return;
        }

        _.each($('ul.resourceAssign li', $container), (obj) => {
            let $el = $(obj);

            if (this.options.get('transport_buttons', true)) {
                this.addTransportButtons($el);
            }

            let $setMax = $('a.setMax', $el).clone().removeAttr('id').replaceAll($('a.setMax', $el));
            let $setMin = $('a.setMin', $el).clone().removeAttr('id').replaceAll($('a.setMin', $el));

            $setMax.click((e) => {
                e.preventDefault();

                let $input = $('input', $el);
                let prevVal = parseInt($input.val());
                $input.val('999999999').focus().blur();

                let val = parseInt($input.val());
                if ((val % 500 !== 0) && (prevVal + 500 < val)) {
                    this.clickButton(-500, $input);
                }
            });

            $setMin.click((e) => {
                e.preventDefault();

                let $input = $('input', $el);
                let val = parseInt($input.val());

                if ((val > 500) && (val % 500 !== 0)) {
                    val -= (val % 500);
                } else {
                    val = 0;
                }

                $input.val(val).focus().blur();
            });
        });

        this.addButtonsEvent();
        $container.data('updated', true);
    }

    addButtonsEvent() {
        $('.ikaeasy_transport_button_trigger').click((e) => {
            let $el = $(e.currentTarget);
            let $input = $el.closest('.sliderinput').find('input');

            this.clickButton(parseInt($el.attr('data-sum')), $input)
        });
    }

    addTransportButtons($el) {
        if ($el.find('.ikaeasy_resource').length) {
            return;
        }

        let $box = $(this.render('transport-buttons.ejs'));
        $('div.sliderinput', $el).prepend($box);
    }

    clickButton(sum, $input) {
        let val = parseInt($input.val());

        if (sum === -500) {
            if ((val > 0) && (val % 500 !== 0)) {
                val -= (val % 500);
            } else {
                val += sum;
            }
        } else if (val % 500 === 0) {
            val += sum;
        } else {
            if (val % sum !== 0) {
                val += sum - (val % sum);
            } else {
                val += sum;
            }
        }

        $input.val(val).focus().blur();
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/warehouse.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        this.ikariamPremiumToggle([$('.premiumOfferBox'), $('#js_safe_capacity_bonus.red').closest('tr'), $('#js_storage_capacity_bonus.red').closest('tr')]);
    }
}

module.exports = Page; });;
require.toCache('/js/page/tpl/wonder.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Page extends Parent {

    init() {
        let $sidebar = $('#sidebar');
        let $li = $sidebar.find('.resources li');
        let res = $li.eq(0).attr("class");

        if ($sidebar.find(`.${res}`).length === 2) {
            $sidebar.find('h4:eq(0)').html(LANGUAGE.getLocalizedString('island_mine_next_level') + ':');
            let need = Utils.getInt($li.eq(0).text());
            let have = Utils.getInt($li.eq(1).text());

            $('#maxLevelNotReached').find('div:eq(0)').after(this.render('island_mine.ejs', {
                res: res,
                have: have,
                need: need
            }));
        }
    }
}

module.exports = Page; });;
require.toCache('/js/page/modules/dummy.js', function(require,module,exports) { 'use strict';

const Parent = require('../common.js');
class Dummy extends Parent {
    constructor(parent) {
        super();

        this.parent = parent;
        this.init();
    }

    init() {

    }

    updated() {
        this.init();
    }

    refresh() {
        super.refresh();
    }

    destroy() {

    }
}

module.exports = Dummy; });;
require.toCache('/js/page/modules/empire.js', function(require,module,exports) { 'use strict';

const DB = require('../../helper/db.js').db();
const Parent = require('./dummy.js');
class Module extends Parent {
    init() {
        if (!$('.ikaeasy-empire').length) {
            this.addLeftMenu();
        }
    }

    updated() {
        if (this.activeModule) {
            this.activeModule.refresh();
            this.activeModule.updated();
        }
    }

    createWindow() {
        const winClass = require('../../helper/win.js');
        this._window = new winClass({
            title: LANGUAGE.getLocalizedString('dummy_empire').replace('<br/>', ' '),
            width: '90%'
        });

        this._window.on('close', () => {
            this._window = null;
            this.activeModule && this.activeModule.destroy();
            this.activeModule = null;
        });
        this._window.getContent().addClass('ikaeasy-empire-wrapper');

        let $el = $(this.render('dummy/empire/window.ejs'));
        this._window.getContent().empty().append($el);
        this.$content = this._window.getContent().find('#tabReport');

        $el.find('.tab').click((e) => {
            this.changeTab($(e.currentTarget).data('tab'));
        });

        this.changeTab('resources');
    }

    close() {
        if (!this._window) {
            return;
        }

        this._window.remove();
    }

    updateContent() {
        if (this.activeModule) {
            this.$content.empty().append(this.activeModule.$el);
        }
    }

    changeTab(tab) {
        if (!this._window) {
            return;
        }

        let $tab = this._window.getContent().find(`.tabmenu .tab[data-tab="${tab}"]`);
        if ($tab.hasClass('selected')) {
            return;
        }

        $tab.addClass('selected').siblings().removeClass('selected');
        this.activeModule && this.activeModule.destroy();

        const module = require(`./empire/${tab}.js`);
        this.activeModule = new module(this);
    }

    addLeftMenu() {
        let $li = Utils.addToLeftMenu('image_empire', LANGUAGE.getLocalizedString('dummy_empire'), false, this.options.get('quick_menu'));
        $li.addClass('ikaeasy-empire');
        $li.click(() => {
            this.toggle();
        });
    }

    toggle(b) {
        if (typeof b !== 'boolean') {
            b = !this._window;
        }

        if (b) {
            if (!this._window) {
                this.createWindow();
            }
        } else {
            this._window && this._window.remove();
        }
    }


    destroy() {
        this.activeModule && this.activeModule.destroy();
    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/empire/buildings.js', function(require,module,exports) { 'use strict';

const DB = require('../../../helper/db.js').db();
const Tooltip = require('../../../helper/tooltip.js');
const Parent = require('./dummy.js');
class Module extends Parent {
    drawUpdateFreq = 60 * 1000; //1 min
    constructor(parent) {
        super(parent, 'buildings.ejs')
    }

    init() {
    }

    getRenderData(callback) {
        let data = {
            cities: this._cities,
            selectedCityId: this._data.cities.selectedCityId,
            manager: Front.ikaeasyData,
            getBuildingInfo: this._getBuildingInfo,
            getDiscount: this.getDiscount,
            buildings: {}
        };

        _.each(Buildings, (building) => {
            data.buildings[building] = Front.ikaeasyData.getBuildingInfo(building);
        });

        callback(data);
    }

    afterRender() {
        this.updateTableWidth();
    }

    _getBuildingInfo(city, building, discount) {
        let result = [];

        _.each(city.buildings[building], (b) => {
            let info = {
                name: b.name,
                building: b.building,
                position: b.position,

                level: b.level
            };

            info.is_upgrading = !!b.completed;
            if ((b.completed) && (b.completed * 1000 < _.now())) {
                // В случае если постройка здания завершена, но город еще не посещали
                info.level += 1;
                info.is_upgrading = false;
            }

            let lvl = (info.is_upgrading) ? info.level + 1 : info.level;
            let nextLevelResources = DB.source[building][lvl];


            info.is_finished = !nextLevelResources;
            info.resources_enough = false;

            if (!info.is_finished) {
                info.resources_enough = true;
                info.resources = {};
                _.each(nextLevelResources, (v, k) => {
                    if (v) {
                        v = Math.floor(v * discount[k]);

                        info.resources[k] = {
                            amount: v,
                            enough: city.resources[k] >= v,
                            required: city.resources[k] - v
                        };

                        if (city.resources[k] < v) {
                            info.resources_enough = false;
                        }
                    }
                });
            }

            result.push(info);
        });

        return result;
    }

    // Фиксим размеры закиксифрованных ячеек чтобы скролл был только у зданий
    updateTableWidth() {
        this.$el.addClass('empire-calc-width');

        let $tr = this.$el.find('table tr:eq(0)');
        let w1 = $tr.find('th:eq(0)').width() + 4;
        let w2 = $tr.find('th:eq(1)').width();

        this.$el.css({marginLeft: w1 + w2 + 37});

        this.$el.find('th.empire_city').css('width', w1);
        this.$el.find('td.empire_city').css('width', w1 - 29); // Магическое число... методом научного тыка
        this.$el.find('.empire_transport').css('left', w1 + 28); // 16 + 12


        this.$el.removeClass('empire-calc-width');
    }

    onRegisterClickHandlers($el){
        this.onHover('.empire-building', (e) => {
            let $td = $(e.currentTarget);
            this.$el.find('.empire-building-hover').removeClass('empire-building-hover');

            if (e.type === 'mouseenter') {
                let idx = $td.index();
                _.each(this.$el.find('tr'), ($tr) => {
                    $($tr).find('td,th').eq(idx).addClass('empire-building-hover');
                });
            }
        });

        // Подготавливаем тултипы
        this.onHover('td.empire-building', (e) => {
            let $b = $(e.currentTarget);
            if (!$b.data('data')) {
                return;
            }

            Tooltip.show(e, $b, $(this.render('dummy/empire/tooltip/building.ejs', $b.data('data'))));
        });

        this.onClick('.empire-building-can-hover', (e) => {
            let $td = $(e.currentTarget);
            let cityId = $td.parent().data('id');

            Tooltip.hide();
            this.parent.close();
            this.openBuilding({
                building: $td.data('building'),
                position: $td.data('position'),
                cityId: cityId
            });
        });
    }

    getDiscount(city) {
        return city.getBuildingsCostDiscount();
    }

    onDestroy() {
        Tooltip.hide();
        Front.ikaeasyData.off('update.empireBuildings');
    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/empire/dummy.js', function(require,module,exports) { 'use strict';

const Parent = require('../../common.js');
class Dummy extends Parent {
    drawTimer;
    firstRender = true;
    drawUpdateFreq = 5000;

    constructor(parent, tpl) {
        super();

        this.tpl = `dummy/empire/tabs/${tpl}`;
        this.parent = parent;
        this.$parent = parent.$content;
        this.init();

        setTimeout(() => {
            this.draw();
            this.registerClickHandlers();
            this.afterFirstRender();
        }, 0);
    }

    init() {
    }

    updated() {
        this.init();
    }

    draw() {
        return this.getRenderData((data) => {
            this.$el = $(this.render(this.tpl, data));
            this.parent.updateContent();

            this.afterRender();
            return true;
        });
    }

    startDrawTimer(){
        this.drawTimer = setInterval(()=>{
            this.draw();
        }, this.drawUpdateFreq);
    }

    afterFirstRender(){
        this.startDrawTimer();
    }

    stopDrawTimer(){
        clearInterval(this.drawTimer);
    }

    onClick(el, callback){
        return this.$parent.off("click", el).on('click', el, callback);
    }

    onHover(el, callback){
        return this.$parent.on('mouseover', el, callback);
    }
    
    registerClickHandlers(){
        if(!this.parent){
            console.error("[IkaEasy]: Cant register click events on empty element!");
            return;
        }
        this.onClick('td.empire_city span', (e) => {
            const $tr = $(e.currentTarget).closest('tr');
            if (!$tr.hasClass('current_city')) {
                this.changeCity($tr.data('id'));
            }
        });
        this.onClick('td.empire_transport [data-js]', (e) => {
            const $tr = $(e.currentTarget).closest('tr');
            if (!$tr.hasClass('current_city')) {
                this.parent.close();

                const js = $(e.currentTarget).data('js');
                Utils.execute_js(js);
            }
        });

        this.onRegisterClickHandlers(this.$parent);
    }

    onRegisterClickHandlers($el){
        // used in child
    }

    _prepareCities() {
        const cities = [];
        _.each(this._data.cities, (city, key) => {
            if ((key.indexOf('city_') === 0) && (city.relationship === CityType.OWN)) {
                city.id = parseInt(city.id);
                cities.push(city);
            }
        });

        this._cities = Object.freeze(cities);
    }

    getRenderData(callback) {
        callback({});
    }

    afterRender() {
        // child use
    }

    afterFirstRender(){
        // child use
    }

    refresh() {
        super.refresh();
    }

    destroy() {//shouldnt be overriden - use onDestroy() instead
        this.stopDrawTimer();
        this.onDestroy();
    }
    onDestroy(){
    }
}

module.exports = Dummy; });;
require.toCache('/js/page/modules/empire/espionage.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Module extends Parent {
    constructor(parent) {
        super(parent, 'espionage.ejs')
    }

    init() {

    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/empire/military.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Module extends Parent {
    constructor(parent) {
        super(parent, 'military.ejs')
    }

    init() {

    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/empire/resources.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
const Tooltip = require('../../../helper/tooltip.js');
const Storage = require("../../../helper/storage.js");

class Module extends Parent {
    $loader;
    loaderEl = '#empire_sync';
    constructor(parent) {
        super(parent, 'resources.ejs')
    }

    init() {
    }

    getRenderData(callback) {
        const data = {
            cities: this._cities,
            selectedCityId: this._data.cities.selectedCityId,
            manager: Front.ikaeasyData
        };

        callback(data);
    }

    afterRender() {
        this.getLoader();
        this.syncAll();
    }

    getLoader(){
        this.$loader = $(this.loaderEl);
    }

    startLoader(){
        if (this.$loader.hasClass('rotate')) {
            return;
        }

        this.$loader.addClass('rotate');
    }

    async syncAll(force = false) {
        const lastUpdateStorage = await Storage.get("empire");
        const nowTime = _.now();
        if(lastUpdateStorage && !force){
            const lastUpdate = lastUpdateStorage.update_time;
            const oneMinute = 1 * 60000;
            const tenMinutes = oneMinute * 10;
            if(this.firstRender){
                this.firstRender = false;
                if(lastUpdate + oneMinute > nowTime){ return; }
            }else{
                if(lastUpdate + tenMinutes > nowTime){ return;}
            }
        }

        this.stopDrawTimer();
        this.startLoader();//loader will stop after re-render
        await Storage.set("empire", {
            "update_time": nowTime
        });

        await Front.ikaeasyData.ajaxUpdateAllCities();
        await Front.ikaeasyData.ajaxUpdatePalace();
        this.draw();
        this.startDrawTimer();
    }

    onRegisterClickHandlers($el){
        this.onClick(this.loaderEl, (e) => {
            e.preventDefault();
            this.startLoader();
            this.syncAll(true);
        });

        this.onHover('tbody td.empire-resource', (e) => {
            let $td = $(e.currentTarget);
            if (!$td.data('resource')) {
                return;
            }

            let data = {
                resource : $td.data('resource'),
                amount   : $td.data('amount'),
                safe     : $td.data('safe'),
                capacity : $td.data('capacity'),
                percent : $td.data('percent'),
                production: $td.data('production'),
                hasProduction: $td.data('has-production')
            };

            Tooltip.show(e, $td, $(this.render('dummy/empire/tooltip/resource.ejs', data)));
        });

        this.onHover('tbody td.empire-research', (e) => {
            let $td = $(e.currentTarget);
            let cityId = $td.parent().data('id');
            let city = Front.ikaeasyData.getCity(cityId);

            Tooltip.show(e, $td, $(this.render('dummy/empire/tooltip/research.ejs', { city: city })));
        });

        this.onHover('tbody td.empire-happiness', (e) => {
            let $td = $(e.currentTarget);
            let cityId = $td.parent().data('id');
            let city = Front.ikaeasyData.getCity(cityId);
            let popData = city.getPopulationData();

            if (popData) {
                Tooltip.show(e, $td, $(this.render('dummy/empire/tooltip/happiness.ejs', { popData: popData })));
            }
        });

        this.onHover('tbody td.empire-corruption', (e) => {
            let $td = $(e.currentTarget);
            Tooltip.show(e, $td, $(this.render('dummy/empire/tooltip/corruption.ejs', { })));
        });
    }

    onDestroy() {
        Tooltip.hide();
    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/notes.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
const DB = require('../../libs/db.js');
class Module extends Parent {
    init() {
        $('#GF_toolbar li.notes').data('ikaeasy', true);
        this.initDB();


        let $a = $('#GF_toolbar li.notes a');
        this.title = $a.text().trim();
        $a.remove();

        $a = $(`<a href="">${this.title}</a>`);
        $('#GF_toolbar li.notes').append($a);
        $a.click((e) => {
            e.preventDefault();
            this.open();
        });

        this.win = null;
    }

    initDB() {
        DB.open({
            server: Utils.getThisKey('main'),
            version: 1,
            schema: {
                notes: {
                    key: {keyPath: 'id', autoIncrement: true}
                }
            }
        }).then((s) => {
            this.db = s;
        });
    }

    updated() {

    }

    getDefaultNote() {
        return new Promise((resolve) => {
            if (typeof this._system_note !== 'undefined') {
                resolve(this._system_note);
                return;
            }

            let sideBarExt = '';
            if (localStorage.sideBarExt) {
                sideBarExt = `&sideBarExt=${localStorage.sideBarExt}`;
            }

            let url = `/index.php?view=avatarNotes${sideBarExt}&actionRequest=${Front.data.actionRequest}&ajax=1`;
            $.get(url, (data) => {
                let html = data[1][1][1];
                let m = html.match(/<textarea[\s\S]*?>([\s\S]*?)<\/textarea>/m);
                if (m) {
                    this._system_note = m[1];
                } else {
                    this._system_note = null;
                }

                resolve(this._system_note);
            }, 'json');
        });
    }

    open() {
        if (!this.db) {
            setTimeout(() => {
                this.open();
            }, 100);
            return;
        }

        if (this.win) {
            this.win.remove();
            return;
        }

        const Win = require('../../helper/win.js');
        this.win = new Win({title: this.title, mainClass: 'ikaeasy-notes-window'}, true);

        this.win.on('close', () => {
            this.win = null;
        });

        this.rebuild();
    }

    async rebuild(id = 0) {
        let [p1, p2] = await Promise.all([ this.getDefaultNote(), this.db.notes.query().all().execute() ]);

        let list = [];
        if (p1) {
            list.push({id: -1, title: LANGUAGE.getLocalizedString('note.ikariam_note'), text: p1, system: true});
        }

        list = list.concat(p2);

        let $el = $(this.render('dummy/notes/note-main.ejs', {list: list}));
        this.win.getContent().empty().append($el);

        $el.find('.ikaeasy-notes-list-content > div').click((e) => {
            let $div = $(e.currentTarget);
            if (!$div.hasClass('ikaeasy-notes-list-active')) {
                this.changeNote($el, parseInt($div.data('id')), list);
            }
        });

        $el.find('.js-ikaeasy-notes-create').click((e) => {
            e.preventDefault();
            this.changeNote($el, null, list);
        });

        this.changeNote($el, id, list);
    }

    changeNote($content, id, list) {
        if ((id !== null) && (!list.length)) {
            id = null;
        }

        let note = null;
        if (id === null) {
            // Создается новая
            $content.find('.ikaeasy-notes-list-content > div.ikaeasy-notes-list-active').removeClass('ikaeasy-notes-list-active');
        } else {
            if (id === 0) {
                $content.find('.ikaeasy-notes-list-content > div:first').addClass('ikaeasy-notes-list-active').siblings().removeClass('ikaeasy-notes-list-active');
                note = list[0];
            } else {
                $content.find(`.ikaeasy-notes-list-content > div[data-id="${id}"]`).addClass('ikaeasy-notes-list-active').siblings().removeClass('ikaeasy-notes-list-active');
                note = _.find(list, {id: id});
            }
        }

        let $el = $(this.render('dummy/notes/note-text.ejs', {note: note || {}}));
        $content.find('.ikaeasy-notes-text').empty().append($el);

        $el.find('.button').click((e) => {
            e.preventDefault();

            if (note && note.system) {
                Utils.execute_js(`BubbleTips.bindBubbleTip(5, 11, "${LANGUAGE.getLocalizedString('note.change_ikariam_note')}")`);

                setTimeout(() =>{
                    let $tip = $('body > .bubble_tip');
                    let left = parseInt($tip.css('left'));
                    $tip.css('left', left - 150);

                    console.log(left)
                }, 50);

                return;
            }

            if ($(e.currentTarget).data('action') === 'delete') {
                if (confirm(LANGUAGE.getLocalizedString('note.delete_note_confirm'))) {
                    this.db.notes.remove(id).then(async () => {
                        this.rebuild();
                    });
                }
                return;
            }

            if ($(e.currentTarget).data('action') === 'save') {
                let title = $el.find('input').val().trim();
                let text = $el.find('textarea').val().trim();

                let data = {
                    title: title,
                    text: text,
                    updated: _.now()
                };

                if (note) {
                    data.id = note.id;
                }

                this.db.notes.update(data).then((note) => {
                    this.rebuild(note[0].id);
                });
            }
        });
    }
}

module.exports = Module; });;
require.toCache('/js/page/modules/worldmap-islandSearch.js', function(require,module,exports) { 'use strict';

const Parent = require('./dummy.js');
class Module extends Parent {
    init() {
        this.islandsSearch();
    }

    islandsSearch() {
        if ($('#ikaeasy_islandsSearch').length) {
            return;
        }

        const db = require('../../helper/db.js').db();
        $('#footer .footerbg').prepend(this.render('worldmap-islandSearch.ejs', { db: db, resources: TradeGoodOrdinals }));
        
        this.foundedCoords = [];
        this.foundedCoordsLastLength = null;
        this.searchParameters = { wonder : [], tradegood: [], general: [] };
        this.existsCorrds = {};
        this.activeFoundedCoords = 0;

        require('../../helper/ikalogsRu.js').getMines(islands => {
            $('#worldmap .islandTile').toArray().forEach(island => this.drawResources(islands, $(island)));

            $(document).off('.dom').on('DOMSubtreeModified.dom', '#worldmap .islandTile', (ev) => {
                setTimeout(() => {
                    if (!$(ev.currentTarget).hasClass('oceanTile') && !$(ev.currentTarget).find('.ikaeasy-resource').length) {
                        this.drawResources(islands, $(ev.currentTarget));
                    }
    
                    this.filterIsland($(ev.currentTarget));
                    this.setFromCounter();
                    this.parent.mapChanged();
                }, 100);
            });
    
            $('#ikaeasy_islandsSearch button').on('click', (e) => {
                this.buttonClick($(e.currentTarget));
            });
    
            $('#ikaeasy_islandSearch_prev, #ikaeasy_islandSearch_next').click((e) => {
                e.preventDefault();
    
                let $el = $(e.currentTarget);
                if (!$el.hasClass('unactive')) {
                    this.activeFoundedCoords += parseInt($el.data('act'));
                    this.changeIsland();
                }
            });
        });
    }

    _checkCondition(coords) {
        if ((this.searchParameters.wonder.length > 0) && (this.searchParameters.wonder.indexOf(coords.wonder) === -1)) {
            return false;
        }

        if ((this.searchParameters.tradegood.length > 0) && (this.searchParameters.tradegood.indexOf(coords.tradegood) === -1)) {
            return false;
        }

        if (this.searchParameters.general.length > 0) {
            if ((this.searchParameters.general.indexOf('generalfull') > -1) && (coords.cities >= 16)) {
                return false;
            }

            if ((this.searchParameters.general.indexOf('generalempty') > -1) && (!coords.cities)) {
                return false;
            }
        }

        return true;
    }

    filterIsland($el, repeat = 0) {
        if ((!$el.hasClass('oceanTile')) && (!$el.hasClass('ikaeasy_islandSearch_filtered'))) {
            let $wonder = $el.find(".wonder");
            let $tradegood = $el.find(".tradegood");
            if ((!$wonder.length || (!$tradegood.length))) {
                return;
            }

            let cntCities = parseInt($el.find(".cities").text());
            if (isNaN(cntCities)) {
                setTimeout(() => {
                    this.filterIsland($el, ++repeat);
                }, 100);
                return;
            }

            let coords = this.getSelectedCoord($el);

            coords.wonder = $wonder.attr('class').match(/(wonder[0-9]+)/)[1];
            coords.tradegood = $tradegood.attr('class').match(/(tradegood[0-9]+)/)[1];
            coords.cities = cntCities;

            let coordsKey = `${coords.x}-${coords.y}`;
            if (this._checkCondition(coords)) {
                $el.addClass('ikaeasy_islandSearch_filtered');

                if (!this.existsCorrds[coordsKey]) {
                    this.foundedCoords.push(coords);
                    this.existsCorrds[coordsKey] = true;
                }
            } else {
                if (this.existsCorrds[coordsKey]) {
                    this.foundedCoords = _.filter(this.foundedCoords, (el) => {
                        return ((el.x !== coords.x) || (el.y !== coords.y)) && this._checkCondition(el);
                    });

                    this.existsCorrds[coordsKey] = false;
                }

                if (this.foundedCoords.length) {
                    $('#ikaeasy_islandSearch_next').removeClass('unactive');
                }
            }
        }
    }

    buttonClick($el) {
        let $worldmap = $('#worldmap');
        let $islands = $worldmap.find('.islandTile');

        let name = $el.data('name');
        let type = $el.data('type');

        $el.toggleClass("active"); 

        // кнопки показа ресурсов на карте
        if ($el.closest('.ikaeasy_island_show_resources').length) {
            const resources = $islands.find(`.ikaeasy-resource-${name}`);
            $el.is('.active') ? resources.removeClass('ikaeasy-d-n') : resources.addClass('ikaeasy-d-n');

            return;
        }

        $worldmap.addClass('ikaeasy_islandSearching');
        $('#ikaeasy_islandSearch_next').removeClass('unactive');
        
        if ($el.hasClass("active")) {
            this.searchParameters[type].push(type + name);
        } else {
            this.searchParameters[type] = _.without(this.searchParameters[type], type + name)
        }

        if ((!this.searchParameters.wonder.length) && ((!this.searchParameters.tradegood.length)) && ((!this.searchParameters.general.length))) {
            this.reset();
        } else {
            $islands.removeClass('ikaeasy_islandSearch_filtered').each((k, el) => {
                this.filterIsland($(el));
            });

            this.setFromCounter();
        }

        if (name === 'reset') {
            this.reset();
        }
    }

    reset() {
        $('#ikaeasy_islandsSearch div:not(.ikaeasy_island_show_resources) button').removeClass('active');
        this.setFromCounter(0);
        this.searchParameters = { wonder : [], tradegood: [], general: [] };
        this.foundedCoords = [];

        this.existsCorrds = {};
        this.activeFoundedCoords = 0;

        $('#worldmap .ikaeasy_islandSearch_filtered').removeClass('ikaeasy_islandSearch_filtered');
        $('#worldmap').removeClass('ikaeasy_islandSearching');
        $('#ikaeasy_islandSearch_prev, #ikaeasy_islandSearch_next').addClass('unactive');
    }

    setFromCounter(count){
        if (typeof count === 'undefined') {
            count = this.foundedCoords.length;
        }

        if (this.foundedCoordsLastLength !== count) {
            $('#ikaeasy_islandSearch_counter .ikaeasy_iSS_cnt_from').text(count);
            this.foundedCoordsLastLength = count;
        }

        if (!this.foundedCoords.length) {
            $('#ikaeasy_islandSearch_prev, #ikaeasy_islandSearch_next').addClass('unactive');
        }
    }

    changeIsland() {
        if (!this.foundedCoords.length) {
            return;
        }

        if (!this.foundedCoords[this.activeFoundedCoords]) {
            this.activeFoundedCoords = 0;
        }

        this.jumpToCoord( this.foundedCoords[this.activeFoundedCoords].x, this.foundedCoords[this.activeFoundedCoords].y );

        $('#ikaeasy_islandSearch_counter .ikaeasy_iSS_cnt_current').text(this.activeFoundedCoords);
        $('#ikaeasy_islandSearch_next').toggleClass('unactive', this.activeFoundedCoords >= this.foundedCoords.length);
        $('#ikaeasy_islandSearch_prev').toggleClass('unactive', !this.activeFoundedCoords);
    }

    jumpToCoord(x, y){
        $('#inputXCoord').val(x);
        $('#inputYCoord').val(y);
        $('form[name="navInputForm"] .submitButton').click();

        // ToDo проверить работает ли без этой функции... теоретически должно
        //this.parent.showTravelTime();
    }

    getSelectedCoord($el){
        let res = $el.attr('title').split(' ');
        if (typeof res !== "undefined") {
            res = res[1].split(':');

            return {
                x: Utils.getInt(res[0]),
                y: Utils.getInt(res[1])
            };
        }

        return false;
    }

    drawResources(islands, $island) {
        const [name] = $island.attr('title').split(' ');

        const [wood, mine, wonder] = islands[name] || ['-', '-', '-'];

        const $mine = $island.find('.tradegood');
        const $wonder = $island.find('.wonder');

        $mine
            .append(`<span class="ikaeasy-resource ikaeasy-resource-mine ikaeasy-l--20 ikaeasy-d-n">${mine}</span>`);
                
        $wonder
            .append(`<span class="ikaeasy-resource ikaeasy-resource-wonder ikaeasy-t-20 ikaeasy-l--20 ikaeasy-d-n">${wonder}</span>`);

        $island
            .append(`<div class="ikaeasy-resource ikaeasy-resource-wood ikaeasy-b-70 ikaeasy-l-55 ikaeasy-d-n"><div class="ikaeasy-resource-icon ikaeasy-w-24 ikaeasy-h-20" style="background-image: url(skin/resources/icon_wood.png);"></div><span>${wood}</span></div>`)
    }
}

module.exports = Module; });;'use strict';

const VERSION = 'a54bb77';

const Research = Object.freeze({
    Seafaring: {
        CARPENTRY: 2150,
        DECK_WEAPONS: 1010,
        PIRACY: 1170,
        SHIP_MAINTENANCE: 1020,
        DRAFT: 1130,
        EXPANSION: 1030,
        FOREIGN_CULTURES: 1040,
        PITCH: 1050,
        MARKET: 2070,
        GREEK_FIRE: 1060,
        COUNTERWEIGHT: 1070,
        DIPLOMACY: 1080,
        SEA_MAPS: 1090,
        PADDLE_WHEEL_ENGINE: 1100,
        CAULKING: 1140,
        MORTAR_ATTACHMENT: 1110,
        MASSIVE_RAM: 1150,
        OFFSHORE_BASE: 1160,
        SEAFARING_FUTURE: 1999
    },

    Economy: {
        CONSERVATION: 2010,
        PULLEY: 2020,
        WEALTH: 2030,
        WINE_CULTURE: 2040,
        IMPROVED_RESOURCE_GATHERING: 2130,
        GEOMETRY: 2060,
        ARCHITECTURE: 1120,
        HOLIDAY: 2080,
        LEGISLATION: 2170,
        CULINARY_SPECIALITIES: 2050,
        HELPING_HANDS: 2090,
        SPIRIT_LEVEL: 2100,
        WINE_PRESS: 2140,
        DEPOT: 2160,
        BUREACRACY: 2110,
        UTOPIA: 2120,
        ECONOMIC_FUTURE: 2999
    },

    Science: {
        WELL_CONSTRUCTION: 3010,
        PAPER: 3020,
        ESPIONAGE: 3030,
        POLYTHEISM: 3040,
        INK: 3050,
        GOVERNMENT_FORMATION: 3150,
        INVENTION: 3140,
        CULTURAL_EXCHANGE: 3060,
        ANATOMY: 3070,
        OPTICS: 3080,
        EXPERIMENTS: 3081,
        MECHANICAL_PEN: 3090,
        BIRDS_FLIGHT: 3100,
        LETTER_CHUTE: 3110,
        STATE_RELIGION: 3160,
        PRESSURE_CHAMBER: 3120,
        ARCHIMEDEAN_PRINCIPLE: 3130,
        SCIENTIFIC_FUTURE: 3999
    },

    Military: {
        DRY_DOCKS: 4010,
        MAPS: 4020,
        PROFESSIONAL_ARMY: 4030,
        SEIGE: 4040,
        CODE_OF_HONOR: 4050,
        BALLISTICS: 4060,
        LAW_OF_THE_LEVEL: 4070,
        GOVERNOR: 4080,
        PYROTECHNICS: 4130,
        LOGISTICS: 4090,
        GUNPOWDER: 4100,
        ROBOTICS: 4110,
        CANNON_CASTING: 4120,
        MILITARISTIC_FUTURE: 4999
    }
});

const Government = Object.freeze({
    ANARCHY:      'anarchie',
    IKACRACY:     'ikakratie',
    ARISTOCRACY:  'aristokratie',
    DICTATORSHIP: 'diktatur',
    DEMOCRACY:    'demokratie',
    NOMOCRACY:    'nomokratie',
    OLIGARCHY:    'oligarchie',
    TECHNOCRACY:  'technokratie',
    THEOCRACY:    'theokratie'
});

const TradeGoodOrdinals = Object.freeze({
    WINE: 1,
    MARBLE: 2,
    GLASS: 3,
    SULFUR: 4,
    WOOD: 5
});

const Resources = {
    WOOD: 'wood',
    WINE: 'wine',
    MARBLE: 'marble',
    GLASS: 'glass',
    SULFUR: 'sulfur',

    POPULATION: 'population',
    CITIZENS: 'citizens',

    SCIENTISTS: 'scientists',
    ACTION_POINTS: 'actionPoints',
    CULTURAL_GOODS: 'culturalGoods',
    TAVERN_WINE_LEVEL: 'tavernWineLevel',
    PRIESTS: 'priests',

    WINE_SPENDING: 'wineSpendings'
};

const GamePlay = Object.freeze({
    TOWN_SPOTS: 17,
    BUILDING_SPOTS: 19,
    GOLD_PER_CITIZEN: 3,
    HAPPINESS_PER_CULTURAL_GOOD: 50,
    HAPPINESS_PER_WINE_SERVING_LEVEL: 60,
    BASE_RESOURCE_PROTECTION: 100,
    RESOURCES_PER_TRANSPORT: 500,
    RESOURCE_PROTECTION_WAREHOUSE: 480,
    RESOURCE_PROTECTION_WAREHOUSE_INACTIVE: 80
});

const Military = Object.freeze({
    // Army
    HOPLITE: 'phalanx',
    STEAM_GIANT: 'steamgiant',
    SPEARMAN: 'spearman',
    SWORDSMAN: 'swordsman',
    SLINGER: 'slinger',
    ARCHER: 'archer',
    GUNNER: 'marksman',
    BATTERING_RAM: 'ram',
    CATAPULT: 'catapult',
    MORTAR: 'mortar',
    GYROCOPTER: 'gyrocopter',
    BALLOON_BOMBADIER: 'bombardier',
    COOK: 'cook',
    DOCTOR: 'medic',
    SPARTAN: 'spartan',
    ARMY: 'army',

    // Navy
    RAM_SHIP: 'ship_ram',
    FLAME_THROWER: 'ship_flamethrower',
    STEAM_RAM: 'ship_steamboat',
    BALLISTA_SHIP: 'ship_ballista',
    CATAPULT_SHIP: 'ship_catapult',
    MORTAR_SHIP: 'ship_mortar',
    SUBMARINE: 'ship_submarine',
    PADDLE_SPEED_SHIP: 'ship_paddlespeedship',
    BALLOON_CARRIER: 'ship_ballooncarrier',
    TENDER: 'ship_tender',
    ROCKET_SHIP: 'ship_rocketship',
    NAVY: 'navy'
});

const CityType = Object.freeze({
    OWN: 'ownCity',
    DEPLOYMENT: 'deployedCities',
    OCCUPATION: 'occupiedCities',
    FOREIGN: 'foreign'
});

const PlayerState = Object.freeze({
    INACTIVE: 'inactive',
    NORMAL: '',
    VACATION: 'vacation',
    NEW: 'noob'
});

const CombatType = Object.freeze({
    BLOCKADE: 'blockade',
    PILLAGE: 'plunder'
});

const UnitData = Object.freeze({
    spearman: {
        minimumBuildingLevelToBuild: 1,
        baseBuildTime: 60,
        isArmy: true,
        speed: 60,
        cargoSize: 3
    },
    slinger: {
        minimumBuildingLevelToBuild: 2,
        baseBuildTime: 90,
        isArmy: true,
        speed: 60,
        cargoSize: 3
    },
    ram: {
        minimumBuildingLevelToBuild: 3,
        baseBuildTime: 600,
        isArmy: true,
        speed: 40,
        cargoSize: 30
    },
    phalanx: {
        minimumBuildingLevelToBuild: 4,
        baseBuildTime: 300,
        isArmy: true,
        speed: 60,
        cargoSize: 5
    },
    cook: {
        minimumBuildingLevelToBuild: 5,
        baseBuildTime: 1200,
        isArmy: true,
        speed: 40,
        cargoSize: 20
    },
    swordsman: {
        minimumBuildingLevelToBuild: 6,
        baseBuildTime: 180,
        isArmy: true,
        speed: 60,
        cargoSize: 3
    },
    archer: {
        minimumBuildingLevelToBuild: 7,
        baseBuildTime: 240,
        isArmy: true,
        speed: 60,
        cargoSize: 5
    },
    catapult: {
        minimumBuildingLevelToBuild: 8,
        baseBuildTime: 1800,
        isArmy: true,
        speed: 40,
        cargoSize: 30
    },
    medic: {
        minimumBuildingLevelToBuild: 9,
        baseBuildTime: 1200,

        isArmy: true,
        speed: 60,
        cargoSize: 10
    },
    spartan: {
        minimumBuildingLevelToBuild: 99,
        baseBuildTime: 0,

        isArmy: true,
        speed: 60,
        cargoSize: 5
    },
    gyrocopter: {
        minimumBuildingLevelToBuild: 10,
        baseBuildTime: 900,
        isArmy: true,
        speed: 80,
        cargoSize: 15
    },
    bombardier: {
        minimumBuildingLevelToBuild: 11,
        baseBuildTime: 1800,
        isArmy: true,
        speed: 20,
        cargoSize: 30
    },
    steamgiant: {
        minimumBuildingLevelToBuild: 12,
        baseBuildTime: 900,
        isArmy: true,
        speed: 40,
        cargoSize: 15
    },
    marksman: {
        minimumBuildingLevelToBuild: 13,
        baseBuildTime: 600,
        isArmy: true,
        speed: 60,
        cargoSize: 5
    },
    mortar: {
        minimumBuildingLevelToBuild: 14,
        baseBuildTime: 2400,
        isArmy: true,
        speed: 40,
        cargoSize: 30
    },

    barbarian: {
        minimumBuildingLevelToBuild: 1,
        baseBuildTime: 1,
        isArmy: true,
        speed: 40,
        cargoSize: 5
    },

    ship_ram: {
        minimumBuildingLevelToBuild: 1,
        baseBuildTime: 2400,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_flamethrower: {
        minimumBuildingLevelToBuild: 4,
        baseBuildTime: 1800,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_submarine: {
        minimumBuildingLevelToBuild: 19,
        baseBuildTime: 3600,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_ballista: {
        minimumBuildingLevelToBuild: 3,
        baseBuildTime: 3000,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_catapult: {
        minimumBuildingLevelToBuild: 3,
        baseBuildTime: 3000,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_mortar: {
        minimumBuildingLevelToBuild: 17,
        baseBuildTime: 3000,
        isArmy: false,
        speed: 30,
        cargoSize: 0
    },
    ship_steamboat: {
        minimumBuildingLevelToBuild: 15,
        baseBuildTime: 2400,
        isArmy: false,
        speed: 40,
        cargoSize: 0
    },
    ship_rocketship: {
        minimumBuildingLevelToBuild: 11,
        baseBuildTime: 3600,
        isArmy: false,
        speed: 30,
        cargoSize: 0
    },
    ship_paddlespeedship: {
        minimumBuildingLevelToBuild: 13,
        baseBuildTime: 1800,
        isArmy: false,
        speed: 60,
        cargoSize: 0
    },
    ship_ballooncarrier: {
        minimumBuildingLevelToBuild: 7,
        baseBuildTime: 3900,
        isArmy: false,
        speed: 20,
        cargoSize: 0
    },
    ship_tender: {
        minimumBuildingLevelToBuild: 9,
        baseBuildTime: 2400,
        isArmy: false,
        speed: 30,
        cargoSize: 0
    }
});

const UnitIds = Object.freeze({
    301: 'slinger',
    302: 'swordsman',
    303: 'phalanx',
    304: 'marksman',
    305: 'mortar',
    306: 'catapult',
    307: 'ram',
    308: 'steamgiant',
    309: 'bombardier',
    310: 'cook',
    311: 'medic',
    312: 'gyrocopter',
    313: 'archer',
    315: 'spearman',
    316: 'barbarian',
    319: 'spartan',

    210: 'ship_ram',
    211: 'ship_flamethrower',
    212: 'ship_submarine',
    213: 'ship_ballista',
    214: 'ship_catapult',
    215: 'ship_mortar',
    216: 'ship_steamboat',
    217: 'ship_rocketship',
    218: 'ship_paddlespeedship',
    219: 'ship_ballooncarrier',
    220: 'ship_tender'
});

const Buildings = {
    TOWN_HALL: 'townHall',
    PALACE: 'palace',
    GOVERNORS_RESIDENCE: 'palaceColony',
    TAVERN: 'tavern',
    MUSEUM: 'museum',
    ACADEMY: 'academy',
    WORKSHOP: 'workshop',
    TEMPLE: 'temple',
    EMBASSY: 'embassy',
    WAREHOUSE: 'warehouse',
    DUMP: 'dump',
    TRADING_PORT: 'port',
    TRADING_POST: 'branchOffice',
    BLACK_MARKET: 'blackMarket',
    MARINE_CHART_ARCHIVE: 'marineChartArchive',
    WALL: 'wall',
    HIDEOUT: 'safehouse',
    BARRACKS: 'barracks',
    SHIPYARD: 'shipyard',
    PIRATE_FORTRESS: 'pirateFortress',
    FORESTER: 'forester',
    CARPENTER: 'carpentering',
    WINERY: 'winegrower',
    WINE_PRESS: 'vineyard',
    STONEMASON: 'stonemason',
    ARCHITECT: 'architect',
    GLASSBLOWER: 'glassblowing',
    OPTICIAN: 'optician',
    ALCHEMISTS_TOWER: 'alchemist',
    FIREWORK_TEST_AREA: 'fireworker'
};

const BuildingsId = {
    'townHall': 0,
    'palace': 11,
    'palaceColony': 17,
    'tavern': 9,
    'museum': 10,
    'academy': 4,
    'workshop': 15,
    'temple': 28,
    'embassy': 12,
    'warehouse': 7,
    'dump': 29,
    'port': 3,
    'branchOffice': 13,
    'blackMarket': 31,
    'marineChartArchive': 32,
    'wall': 8,
    'safehouse': 16,
    'barracks': 6,
    'shipyard': 5,
    'pirateFortress': 30,
    'forester': 18,
    'carpentering': 23,
    'winegrower': 21,
    'vineyard': 26,
    'stonemason': 19,
    'architect': 24,
    'glassblowing': 20,
    'optician': 25,
    'alchemist': 22,
    'fireworker': 27
};

const BuildingsMultiple = {
    [Buildings.WAREHOUSE] : true,
    [Buildings.TRADING_PORT] : true,
    [Buildings.SHIPYARD] : true
};

const Time = {
    SECONDS_PER_HOUR: 3600,
    SECONDS_PER_MINUTE: 60,
    MILLIS_PER_DAY: 1000 * 60 * 60 * 24,
    MILLIS_PER_HOUR: 1000 * 60 * 60,
    MILLIS_PER_SECOND: 1000,
    MILLIS_PER_MINUTE: 60000,
    MINUTES_PER_DAY: 24 * 60,
    MINUTES_PER_HOUR: 60,
    HOURS_PER_DAY: 24,
    HOURS_PER_WEEK: 24 * 7,

    SAFE_TIME_DELTA: 1000,
    INITIAL_PAGE_LOAD_DELTA: 2000,

    TIMEUNITS: {
        second: 1,
        minute: 60,
        hour: 3600,
        day: 86400
    }
};

const Movements = {
    Mission: {
        TRANSPORT: 'transport',
        DEPLOY_ARMY: 'deployarmy',
        DEPLOY_NAVY: 'deploynavy',
        PLUNDER: 'plunder',
        TRADE: 'trade'
    },

    Stage: {
        LOADING: 'loading',
        EN_ROUTE: 'en_route',
        RETURNING: 'returning'
    },

    MissionId: {
        TRANSPORT: 1,
        TRADE: 3,
        COLONIZE: 4,

        PLUNDER: 7
    },

    MissionState: {
        LOADING: 1,
        EN_ROUTE: 2
    }
};

const PremiumFeatures = {
    DOUBLED_STORAGE_CAPACITY: '33',// "Увеличенная вместительность складов"
    DOUBLED_SAFE_CAPACITY: "17",// "Увеличенная защита от разграбления"
    PREMIUM_ACCOUNT: "15", // "Премиум аккю"
    DOUBLE_WOOD: "16",//"Увеличено производство стройматериалов"
};

const WINE_USE = [0, 4, 8, 13, 18, 24, 30, 37, 44, 51, 60, 68, 78, 88, 99, 110, 122, 136, 150, 165, 180, 197, 216, 235, 255, 277, 300, 325, 351, 378, 408, 439, 472, 507, 544, 584, 626, 670, 717, 766, 818, 874, 933, 995, 1060, 1129, 1202, 1280, 1362];
const PORT_LOADING_SPEED = [10, 30, 60, 93, 129, 169, 213, 261, 315, 373, 437, 508, 586, 672, 766, 869, 983, 1108, 1246, 1398, 1565, 1748, 1950, 2172, 2416, 2685, 2980, 3305, 3663, 4056, 4489, 4965, 5488, 6064, 6698, 7394, 8161, 9004, 9931, 10951, 12073, 13308, 14666, 16159, 17803, 19616, 21613, 23813, 26237];
const MAX_SCIENTISTS =  [0, 8, 12, 16, 22, 28, 35, 43, 51, 60, 69, 79, 89, 100, 111, 122, 134, 146, 159, 172, 185, 198, 212, 227, 241, 256, 271, 287, 302, 318, 335, 351, 368];;'use strinct';

const Utils = {
    getThisKey: function(add = null) {
        let key = [this.getServerDomain(), this.getServerWorld(), Front.data.avatarId];
        if (add) {
            key.push(add);
        }

        return key.join('-');
    },

    setItem: function(name, value, time) {
        let v = {};
        v["value"]  = value;
        v["expire"] = (time) ? _.now() + time * 1000: 0;

        localStorage.setItem(this.getThisKey(name), JSON.stringify(v));
        return true;
    },

    updateObjectItem: function(name, values, time, def = {}) {
        let curValue = this.getItem(name) || def;
        let v = {
            value: _.defaults(curValue, values),
            expire: (time) ? _.now() + time * 1000: 0
        };

        localStorage.setItem(this.getThisKey(name), JSON.stringify(v));
        return true;
    },

    getItem: function(name){
        let t = localStorage.getItem(this.getThisKey(name));
        let v = (!t) ? false : ((t !== 'false') ? JSON.parse(t) : false);
        if (v){
            if ((v['expire'] > 0) && (v['expire'] < _.now())) {
                Utils.removeItem(name);
                v = false;
            }
        }

        return (v) ? v['value'] : null;
    },

    removeItem: function(name) {
        return localStorage.removeItem(this.getThisKey(name));
    },


    getServerId() {
        let server = this.getServerDomain();
        const servers = [{"server_id":"1","server_short":"ru","server_name":"Russia"},{"server_id":"2","server_short":"en","server_name":"United Kingdom"},{"server_id":"3","server_short":"de","server_name":"Germany"},{"server_id":"4","server_short":"ar","server_name":"Argentina"},{"server_id":"5","server_short":"ba","server_name":"Balkan"},{"server_id":"6","server_short":"by","server_name":"Belarus"},{"server_id":"7","server_short":"br","server_name":"Brazil"},{"server_id":"8","server_short":"bg","server_name":"Bulgaria"},{"server_id":"9","server_short":"cl","server_name":"Chile"},{"server_id":"10","server_short":"co","server_name":"Colombia"},{"server_id":"11","server_short":"cz","server_name":"Czech Repuplic"},{"server_id":"12","server_short":"dk","server_name":"Denmark"},{"server_id":"13","server_short":"ee","server_name":"Estonia"},{"server_id":"14","server_short":"fi","server_name":"Finland"},{"server_id":"15","server_short":"fr","server_name":"France"},{"server_id":"16","server_short":"gr","server_name":"Greece"},{"server_id":"17","server_short":"hk","server_name":"Hong Kong"},{"server_id":"18","server_short":"hu","server_name":"Hungary"},{"server_id":"19","server_short":"id","server_name":"Indonesia"},{"server_id":"20","server_short":"ir","server_name":"Iran"},{"server_id":"21","server_short":"il","server_name":"Israel"},{"server_id":"22","server_short":"it","server_name":"Italy"},{"server_id":"23","server_short":"lv","server_name":"Latvia"},{"server_id":"24","server_short":"lt","server_name":"Lithuania"},{"server_id":"25","server_short":"mx","server_name":"Mexico"},{"server_id":"26","server_short":"nl","server_name":"Netherlands"},{"server_id":"27","server_short":"no","server_name":"Norway"},{"server_id":"28","server_short":"pk","server_name":"Pakistan"},{"server_id":"29","server_short":"pe","server_name":"Peru"},{"server_id":"30","server_short":"ph","server_name":"Philippines"},{"server_id":"31","server_short":"pl","server_name":"Poland"},{"server_id":"32","server_short":"pt","server_name":"Portugal"},{"server_id":"33","server_short":"ro","server_name":"Romania"},{"server_id":"34","server_short":"rs","server_name":"Serbia"},{"server_id":"35","server_short":"sk","server_name":"Slovakia"},{"server_id":"36","server_short":"si","server_name":"Slovenia"},{"server_id":"37","server_short":"es","server_name":"Spain"},{"server_id":"38","server_short":"se","server_name":"Sweden"},{"server_id":"39","server_short":"tw","server_name":"Taiwan"},{"server_id":"40","server_short":"tr","server_name":"Turkey"},{"server_id":"41","server_short":"ae","server_name":"United Arab Emirates"},{"server_id":"42","server_short":"us","server_name":"United States of America"},{"server_id":"43","server_short":"ve","server_name":"Venezuela"},{"server_id":"44","server_short":"vn","server_name":"Vietnam"}];

        let s = _.find(servers, {server_short: server});
        return s.server_id || 1;
    },

    getServerDomain: function() {
        let hostMatch = /(s\d+)-([a-z]+)?\.ikariam.gameforge.com/i.exec(top.location.host);
        return (hostMatch ? hostMatch[2] : false) || 'ru';
    },

    getServerWorld: function() {
        let hostMatch = /(s\d+)-([a-z]+)?\.ikariam.gameforge.com/i.exec(top.location.host);
        return (hostMatch ? hostMatch[1] : false) || 's?';
    },

    getInt: function(a) {
        if (!a) {
            return 0;
        }

        return parseInt(a.replace(/[^\d-]+/g, '')) || 0;
    },

    getFloat: function(a, separators) {
        if (!a) {
            return 0;
        }

        let sep = (typeof Front !== 'undefined') ? { thousand: Front.data.localizationStrings.thousandSeperator, decimal: Front.data.localizationStrings.decimalPoint } : separators;
        a = a.trim().replace(new RegExp(_.escapeRegExp(sep.thousand), 'g'), '').replace(new RegExp(_.escapeRegExp(sep.decimal), 'g'), '.');
        return parseFloat(a.replace(/[^\d-.]+/g, ''));
    },

    handleSize: function(size) {
        if ((typeof size === 'number') || (/^([0-9]+)$/.test(size))) {
            return `${size}px`;
        }

        return size;
    },

    formatNumber: function(number, def, forceShowSign = true, separators) {
        def = def || '0';
        let sep = (typeof Front !== 'undefined') ? { thousand: Front.data.localizationStrings.thousandSeperator, decimal: Front.data.localizationStrings.decimalPoint } : separators;
        let result = ((number || "") + "").replace(/(\d)(?=(?:\d{3})+(?:$|\.|,))/g, "$1" + sep.thousand).replace(".", sep.decimal);

        if ((forceShowSign) && (number > 0)) {
            result = `+${result}`;
        }

        return ((!result) || (result === '0')) ? def : result;
    },

    numberToBeauty: function(number) {
        number = Utils.getInt(number.toString());
        if (number < 1000) { return number; }
        if (number < 1000000) { return `${Math.floor(number / 1000)}k`; }

        return `${Math.floor(number / 1000000)}kk`;
    },

    parseTimeString: function(str, timeunits) {
        timeunits = (typeof Front !== 'undefined') ? Front.data.localizationStrings.timeunits.short : timeunits;

        let time = 0;
        let list = str.split(' ');
        _.each(list, (v) => {
            let cnt = Utils.getInt(v);
            let unit = v.replace(/([0-9]+)/g, '');

            let t = _.findKey(timeunits, (o) => { return o === unit; });
            if (Time.TIMEUNITS[t]) {
                time += cnt * Time.TIMEUNITS[t];
            }
        });

        return time * 1000;
    },

    trailZero: function(a) {
        if (a >= 10) {
            return a;
        }

        return `0${a}`;
    },

    transformHours: function(hours) {
        if (hours < 24) { return Math.round(hours) + ' ' + LANGUAGE.char_hour; }
        if (hours < 730) { return Math.round(hours / 24) + ' ' + LANGUAGE.char_day; }
        if (hours < 8765) { return Math.round(hours / 730) + ' ' + LANGUAGE.char_month; }

        return Math.round(hours / 8765) + ' ' + LANGUAGE.char_year;
    },

    secondToTime: function(sec) {
        let mins = Math.round(sec / 60);
        let hours = Math.floor(mins / 60);
        let minutes = Math.floor(mins % 60);

        return `${hours}:${Utils.trailZero(minutes)}`;
    },

    generateServerName: function(name){
        return `${Utils.getServerDomain()}_${Utils.getServerWorld()}_${name}`;
    },

    generateSubDomain: function(){
        return `https://${Utils.getServerWorld()}-${Utils.getServerDomain()}`;
    },

    generateDomain: function(){
        return `${Utils.generateSubDomain()}.ikariam.gameforge.com`;
    },

    addToLeftMenu: function(image, title, toBottom, quick_menu = true) {
        let $leftMenu = $('#leftMenu');
        if (!$leftMenu.length) {
            $leftMenu = $('<div id="leftMenu"></div>');
            $('#container').append($leftMenu);
        }

        let $js_viewCityMenu = $('#js_viewCityMenu');
        if (!$js_viewCityMenu.length) {
            $js_viewCityMenu = $('<div id="js_viewCityMenu" class="slot_menu city_menu"></div>');
            $leftMenu.append($js_viewCityMenu);
        }

        let $menuSlot = $js_viewCityMenu.find('.menu_slots');
        if (!$menuSlot.length) {
            $menuSlot = $('<ul class="menu_slots"></ul>');
            $js_viewCityMenu.append($menuSlot);
        }

        let quickMenu = quick_menu ? 'no-transition' : '';


        const templater = require('./helper/templater.js');
        let $li = $(templater.render('utils-leftSlot.ejs', {index: $('li', $menuSlot).length, title: title, image: image, transition: quickMenu}));

        if (toBottom) {
            $menuSlot.append($li);
        } else {
            $menuSlot.prepend($li);
        }

        return $li;
    },

    addToSideBar: function(title, content, classes = '') {
        const templater = require('./helper/templater.js');

        let $sideBar = $('#sidebar');
        let $window = $(templater.render('utils-winSideBar.ejs', { title: title, content: content, classes: classes }));

        if (!$sideBar.length) {
            $sideBar = $('<div id="sidebar" class="ikaeasy_sidebar_generated"><ul id="sidebarWidget"></ul></div>');
            $('#leftMenu').after($sideBar);
        }

        $sideBar.find('#sidebarWidget').append($window);

        $('.accordionItem .accordionTitle .indicator').off('click.ikaeasy').on('click.ikaeasy', function(){
            $(this).parent().toggleClass('active').next('.accordionContent').toggleClass('ikaeasy_toggle');
        });

        Utils.draggable($('.accordionTitle', $window), $sideBar);
    },

    draggable: function($el1, $el2, callback) {
        let draggable = {
            drag: false,
            mouseX: 0,
            mouseY: 0,
            sX: 0,
            xY: 0
        };

        let $doc = $(document);
        let addEvent = () => {
            let screenBorder = {
                right: $(window).width() - 20 - $el2.width(),
                bottom: $(window).height() - 20 - $el2.height()
            };

            $doc.off('.draggable').on('mousemove.draggable', (e) => {
                e.preventDefault();

                if (draggable.drag) {
                    let top = draggable.sY + (e.pageY - draggable.mouseY);
                    let left = draggable.sX + (e.pageX - draggable.mouseX);

                    top = Math.min(Math.max(20, top), screenBorder.bottom);
                    left = Math.min(Math.max(20, left), screenBorder.right);

                    $($el2).css({
                        right: 'auto',
                        top: top,
                        left: left
                    });
                }
            });

            $doc.on('mouseup.draggable', (e) => {
                e.preventDefault();

                if (draggable.drag) {
                    $doc.off('.draggable');
                    callback && callback();
                    draggable.drag = false;
                }
            });
        };

        $($el1).mousedown((e) => {
            e.preventDefault();

            draggable.drag = true;
            draggable.mouseX = e.pageX;
            draggable.mouseY = e.pageY;
            draggable.sX = $($el2).position().left;
            draggable.sY = $($el2).position().top;

            addEvent();
        });
    },

    createDynamicWin: function(title, $content) {
        const templater = require('./helper/templater.js');
        let $window = $(templater.render('utils-dynamicWindow.ejs', { title: title }));
        $('.dynamic', $window).append($content);

        return $window;
    },

    createDynamic: function(title, content) {
        let win = $('<ul id="sidebarWidget" style="width: 228px; "><li class="accordionItem"><a href="#toggle" tabindex="0" class="accordionTitle active" style="cursor:default !important;">' + title + '</a><div class="accordionContent"><div class="dynamic"></div></div></li></ul>');

        if (content) {
            $('.dynamic', win).append(content);
        }
        $('#sidebar').append(win);

        return win;
    },

    execute_js: function(code) {
        let $sc = $(`<script type="text/javascript"">${code}</script>`);
        $('head').append($sc);

        setTimeout(() => {
            $sc.remove();
        }, 100);
    },

    _modifyLANGUAGES: function () {
        if (typeof LANGUAGE.getLocalizedString !== 'function') {
            LANGUAGE.getLocalizedString = function(key, params) {
                let str = LANGUAGE[key];
                if ((typeof str !== 'string') || (!str)) {
                    return key;
                }

                return _LanguageUtils.applyVariables(str, params);
            };
        }
    },

    sendNotification(title, body, params) {
        let pre = {
            domain: Utils.getServerDomain(),
            world: Utils.getServerWorld(),
            name: Front.data.serverName,
            lang: Utils.language
        };

        if (params) {
            pre = _.merge(pre, params);
        }

        chrome.runtime.sendMessage({ cmd: 'notification', id: JSON.stringify(pre), requireInteraction: !!params, title: LANGUAGE.getLocalizedString(title), body: LANGUAGE.getLocalizedString(body) });
    }
};

function getJSON(url, callback) {
    $.ajax({
        url: url,
        async: true,
        xhrFields: { withCredentials: true },
        dataType: "json",
        error: callback,
        success: callback
    });
}

function postJSON(url, data, callback) {
    $.ajax({
        url: url,
        data: data,
        async: true,
        xhrFields: { withCredentials: true },
        type: "POST",
        error: callback || false,
        success: callback || false,
        dataType: "json"
    });
}


if ((typeof module === 'object') && (module.exports)) {
    module.exports = Utils;
}

const _LanguageUtils = (function() {
    function getValue(obj, key, p, defValue) {
        let res = obj && obj[key];
        if (typeof res === 'function') {
            res = res.call(obj, p);
        }
        return (res == null) ? (defValue || null) : res;
    }

    return {
        applyVariables: function (str, params) {
            return str.replace(/\%(~?)(\w+)(?::(\w+))?\%/g, function(s, glob, key, p) {
                return getValue(params, key, p, s);
            });
        }
    };
})();
;'use strict';

const assignedLng = {
    'test': 'en',
    'en': 'en',
    'us': 'en',
    'de': 'de',
    'il': 'he',
    'pl': 'pl',
    'ru': 'ru',
    'rs': 'sr',
    'tr': 'tr',
    'ar': 'es',
    'br': 'en',
    'cl': 'es',
    'co': 'es',
    'dk': 'en',
    'es': 'es',
    'fr': 'en',
    'it': 'it',
    'lv': 'en',
    'lt': 'lt',
    'hu': 'en',
    'mx': 'es',
    'nl': 'en',
    'no': 'en',
    'pe': 'es',
    'pt': 'en',
    'ro': 'en',
    'si': 'en',
    'sk': 'en',
    'fi': 'en',
    'se': 'en',
    've': 'es',
    'cz': 'en',
    'gr': 'gr',
    'bg': 'bg',
    'ae': 'en',
    'ir': 'en',
    'tw': 'en',
    'hk': 'en'
};

let lang = assignedLng[Utils.getServerDomain()] || 'en';
window.LANGUAGE = require(`../lang/en.js`);
Utils.language = 'en';

if (lang !== 'en') {
    let newLang = require(`../lang/${lang}.js`);
    if (newLang) {
        window.LANGUAGE = $.extend(true, window.LANGUAGE, newLang);
        Utils.language = lang;
    }
}

moment.locale(Utils.language);
Utils._modifyLANGUAGES();;'use strict';

const Event = require('./helper/event.js');
class Navigation extends Event {
    constructor() {
        super();

        this.bg = null;
        this.tpl = null;
        this.data = null;
        this.ikaeasyData = null;
        this.app_version = null;

        const broker = require('helper/broker.js');

        window.addEventListener('message', (event) => {
            if (event.source !== window) {
                return;
            }

            if ((event.data.type) && ((event.data.type === 'FROM_IKAEASY_V3'))) {
                if (event.data.cmd === 'update') {
                    let tpl = this.tpl;
                    let bg = this.bg;

                    this.bg = event.data.bg;
                    this.tpl = event.data.tpl;
                    this.data = event.data.data || this.data;
                    this.viewData = event.data.viewData || null;
                    // console.log(111, this.viewData)

                    if (!this.ikaeasyData) {
                        const Manager = require('data/Manager.js');
                        this.ikaeasyData = new Manager(() => {
                            this._update(bg, tpl);
                        });

                        let whatnews = require('./helper/whatnews.js');
                        whatnews.init(this.app_version);
                    } else {
                        this._update(bg, tpl);
                    }
                } else if (event.data.cmd === 'form') {
                    this.emit('form', [event.data.form]);
                }else if(event.data.cmd === 'ajax'){
                    this.emit('ajax', [event.data.request]);
                }
            }
        }, false);
        this.httpListenerHandler();

        chrome.runtime.sendMessage({ cmd: 'get-version' }, (version) => {
            this.app_version = version;
        });

        $('head').append(`<link href="${chrome.extension.getURL('css/ikaeasy.css')}?${VERSION}"  rel="stylesheet" type="text/css" />`);
        $('head').append(`<script type="text/javascript" src="${chrome.extension.getURL('inner/ikaeasy.js')}"></script>`);

        require('./helper/ikalogsRu.js').getMines(data => {
            window.islandsInfo = data;

            // этот код использовался для первичной отрисовки
            // $('#map1 .islandTile').toArray().forEach(island => {
            //     const $island = $(island);

            //     const [name] = $island.attr('title').split(' ');

            //     const [wood, mine, wonder] = data[name] || ['-', '-', '-'];

            //     const $mine = $island.find('.tradegood');
            //     const $wonder = $island.find('.wonder');

            //     $mine
            //         .append(`<span class="ikaeasy-resource ikaeasy-l--20">${mine}</span>`);
                        
            //     $wonder
            //         .append(`<span class="ikaeasy-resource ikaeasy-t-20 ikaeasy-l--20">${wonder}</span>`);

            //     $island
            //         .append(`<div class="ikaeasy-resource ikaeasy-b-70 ikaeasy-l-55"><div class="ikaeasy-resource-icon ikaeasy-w-24 ikaeasy-h-20" style="background-image: url(skin/resources/icon_wood.png);"></div><span>${wood}</span></div>`)
            // });
        });
    }

    _update(bg, tpl) {
        console.info(`Background: ${this.bg}, template: ${this.tpl}`);

        if (bg !== this.bg) {
            if (this.page_bg) {
                this.page_bg.selfDestroy();
            }

            this.page_bg = this.initPage(this.bg, 'bg');
        } else if (this.page_bg) {
            this.page_bg.refresh();
            this.page_bg.updated();
        }

        if (tpl !== this.tpl) {
            if (this.tpl) {
                require('./helper/win.js').removeActiveWindow();
            }

            if (this.page_tpl) {
                this.page_tpl.selfDestroy();
            }

            this.page_tpl = this.initPage(this.tpl, 'tpl');
        } else if (this.page_tpl) {
            this.page_tpl.refresh();
            this.page_tpl.updated();
        }
    }

    initPage(name, path) {
        if (typeof name !== 'string') {
            return;
        }

        let page = require(`page/${path}/${name}.js`);
        if (!page) {
            return null;
        }

        return new page(this, name);
    }

    premiumUpdated() {
        this.page_bg && this.page_bg.premiumUpdated();
        this.page_tpl && this.page_tpl.premiumUpdated();
    }

    httpListenerHandler(){
        this.on('ajax', (request)=>{
            if(!request.data || request.data === ''){ return; }
            const data = typeof request.data === 'string' ? JSON.parse(request.data) : request.data;
            this._parseObject(data);
        });
    }
    
    _parseObject = (arr) => {
        arr.forEach((data) => {
            if ((Array.isArray(data)) && (data.length === 2)) {
                let closure = this[`handle_${data[0]}`];
                if (typeof closure === 'function') {
                    closure(data[1]);
                }
            }
        });
    }

    handle_changeView = (dataArr) => {
        if(!(Array.isArray(dataArr) || dataArr.length > 1) 
            && !(dataArr[0] && typeof dataArr[0] === 'string')
            ){
                return;
            }

        const fileName = dataArr[0];
        const rawHtml = dataArr[1];

        const controller = require(`/js/page/tpl/controllers/${fileName}.controller.js`);
        if (!controller) {
            return null;
        }
        controller.ajaxHTML = rawHtml;
        controller.init();
        return true;
    }
    

    handle_updateGlobalData = (data) => {
        if (data.actionRequest) {
            this.data.actionRequest = data.actionRequest;
            Utils.execute_js(`ikariam.model.actionRequest='${data.actionRequest}';`);
        }

        let bgData = data.backgroundData || {};
        let headData = data.headerData || {};
        let cityId = parseInt(bgData.id);
        let city = this.ikaeasyData.getCity(cityId);

        let list = ['isCapital', 'islandId', 'name', 'ownerId', 'ownerName', 'maxActionPoints'];

        list.forEach((v) => {
            if (typeof bgData[v] !== 'undefined') {
                city._data[v] = bgData[v];
            } else if (typeof headData[v] !== 'undefined') {
                city._data[v] = headData[v];
            }
        });

        if (city._data.ownerId) {
            city._data.ownerId = parseInt(city._data.ownerId);
        }

        if (bgData.position) {
            city._data.buildings = city._getBuilds(bgData.position);
        }

        if (headData.maxResources) {
            city._data.maxResources[Resources.WOOD]   = headData.maxResources.resource;
            city._data.maxResources[Resources.WINE]   = headData.maxResources[TradeGoodOrdinals.WINE];
            city._data.maxResources[Resources.MARBLE] = headData.maxResources[TradeGoodOrdinals.MARBLE];
            city._data.maxResources[Resources.SULFUR] = headData.maxResources[TradeGoodOrdinals.SULFUR];
            city._data.maxResources[Resources.GLASS]  = headData.maxResources[TradeGoodOrdinals.GLASS];
        }

        if (headData.currentResources) {
            city._data.resources[Resources.WOOD]       = headData.currentResources.resource;
            city._data.resources[Resources.WINE]       = headData.currentResources[TradeGoodOrdinals.WINE];
            city._data.resources[Resources.MARBLE]     = headData.currentResources[TradeGoodOrdinals.MARBLE];
            city._data.resources[Resources.SULFUR]     = headData.currentResources[TradeGoodOrdinals.SULFUR];
            city._data.resources[Resources.GLASS]      = headData.currentResources[TradeGoodOrdinals.GLASS];
            city._data.resources[Resources.CITIZENS]   = headData.currentResources[Resources.CITIZENS];
            city._data.resources[Resources.POPULATION] = headData.currentResources[Resources.POPULATION];
        }

        if (headData.producedTradegood) {
            let islandResource = _.findKey(TradeGoodOrdinals, (v) => { return v === parseInt(headData.producedTradegood); });

            city._data.production = {}; // Это мы зачищаем, потому что возможен перенос города с одного острова на другой
            city._data.production[Resources.WOOD] = Math.floor(headData.resourceProduction * 3600);
            city._data.production[Resources[islandResource]] = Math.floor(headData.tradegoodProduction * 3600);
            city._data.production[Resources.WINE_SPENDING] = headData.wineSpendings;

            city._data.productionEQ = {};
            city._data.productionEQ[Resources.WOOD] = headData.resourceProduction;
            city._data.productionEQ[Resources[islandResource]] = headData.tradegoodProduction;

            city._updateWineSpending(headData.wineSpendings);
        }

        city._data.updatingTime = _.now();
        city.save();
    }
}

const Front = new Navigation();