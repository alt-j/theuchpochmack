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
            src: '//cs1-43v4.vk.me/p21/cd2060a75c8ba3.mp3?extra=COm8EfI4RpM0gZwwCqaNw1FlwM8xxxJkYMGz9D49CMyRsqd9ri_7OzyyS2pVCh-gSLt1ujd5bHxbIZEJl998jeKMZDMBWA,167'
        }, {
            name: 'lightbulbs',
            src: '//cs1-41v4.vk.me/p10/a492be0c2f4b9b.mp3?extra=jL52QMVeVrJBrwnl9RZi1-R4n5POx75dtgJaqO8BBT5cqFk8Y7iSIXujlUKoq7lCU3Gc94B_8NdFtTAwsZyRonQuRWu3s1E,354'
        }]
    },{
        block: 'poster'
    }]
};
