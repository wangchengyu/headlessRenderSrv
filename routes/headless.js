var express = require('express');
var router = express.Router();
var puppeteer = require("puppeteer"); // <-- process.cwd() instead of normal require

async function ssr(url) {
    var browser = await puppeteer.launch({args: ['--headless', '--no-sandbox', '--disable-setuid-sandbox']});
    var page = await browser.newPage();

    var html = "";

    try {
        await page.goto(url, {waitUntil: 'networkidle0', timeout: 10* 1000});
        html = await page.content(); // 页面的html内容
    } catch (e) {
        console.log(e);
        html = "Server Error";
    }

    await page.close();
    await browser.close();
    return html;
}

/* GET headless listing. */
router.get('/', function(req, res, next) {
    var url = req.query.url;
    var html = ssr(url);

    html.then(function(value) {
        res.send(value);
    });
});

module.exports = router;
