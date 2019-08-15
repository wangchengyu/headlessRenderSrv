var express = require('express');
var router = express.Router();
var puppeteer = require("puppeteer"); // <-- process.cwd() instead of normal require
var browser = "";

async function ssr(url) {

    if (browser === "")
        browser = await puppeteer.launch({headless: true});

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
    return html;
}

function loadCacheFile(url) {
    return html;
}

function saveCacheFile(url, html) {

}

/* GET headless listing. */
router.get('/', function(req, res, next) {
    var url = req.query.url;
    var html = ssr(url);

    if (typeof html == "string")
        res.send(value);
    else

        html.then(function(value) {
            res.send(value);
        });
});

module.exports = router;
