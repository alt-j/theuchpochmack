module.exports = function(config) {
    config.includeConfig('enb-bevis-helper');

    var browserSupport = [
        'IE >= 9',
        'Safari >= 5',
        'Chrome >= 33',
        'Opera >= 12.16',
        'Firefox >= 28'
    ];

    var bevisHelper = config.module('enb-bevis-helper')
        .browserSupport(browserSupport)
        .useAutopolyfiller();

    config.setLanguages(['ru']);

    config.node('pages/index', function (nodeConfig) {
        bevisHelper
            .forStaticHtmlPage()
            .configureNode(nodeConfig);
    });

};