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
            src: 'audio/someday.mp3'
        }, {
            name: 'lightbulbs',
            src: 'audio/lightbulbs.mp3'
        }]
    },{
        block: 'poster'
    }]
};
