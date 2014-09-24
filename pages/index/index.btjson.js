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
            '   var player = Player.find(document.body);',
            '});'
        ].join('\n')
    }],
    body: [{
        block: 'player',
        tracks: [{
            name: 'lightbulbs',
            src: 'https://www.dropbox.com/s/dcftlz4n8z87eq0/lightbulbs.mp3?dl=1'
        }, {
            name: 'someday',
            src: 'https://www.dropbox.com/s/c1tspdoyathaeo0/someday.mp3?dl=1'
        }]
    },{
        block: 'poster'
    }]
};
