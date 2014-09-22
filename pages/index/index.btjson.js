module.exports = {
    block: 'page',
    title: 'The Uchpochmack',
    favicon: 'favicon.ico',
    image: 'image.jpg',
    styles: [{
        url: '_index.css'
    }],
    scripts: [{
        url: '_index.ru.js'
    }, {
        source: [
            'modules.require(\'player\', function (Player) {',
            '   var player = Player.find(document.body)',
            '});'
        ].join('\n')
    }],
    body: [{
        block: 'selfie'
    }, {
        block: 'player',
        tracks: [{
            name: 'someday',
            src: '//cs1-31v4.vk.me/p9/a698d70e7561fa.mp3'
        }, {
            name: 'lightbulbs',
            src: '//cs1-41v4.vk.me/p10/978d3f3ead8dae.mp3'
        }]
    },{
        block: 'poster'
    }]
};
