var express = require('express');
var router = express.Router();
var puppeteer = require("puppeteer"); // <-- process.cwd() instead of normal require
var browser = "";

async function ssr(url) {
    if (typeof browser == "string")
        browser = await puppeteer.launch({headless: true});

    var page = await browser.newPage();
    await page.goto(url, {waitUntil: 'networkidle0'});
    const html = await page.content(); // 页面的html内容
    await page.close();
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
