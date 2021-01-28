var express = require('express');
var router = express.Router();
var puppeteer = require("puppeteer");
var util = require("util");
var browser = "";
var exec = require('child_process').exec

async function loadPage(url) {

    if (browser === "")
        browser = await puppeteer.launch({headless: true});

    var page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36");

    var html = "";

    try {
        console.log("=== start to load page >> " + url + " ... ");
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30 * 1000});
        console.log("=== loaded page >> " + url + " << done!")
    } catch (e) {
        await page.close();
        console.log(e);
        return "Server Error";
    }

    return page;
}

async function getSortId(bookId) {
    
    var page = await loadPage("http://www.zxcs.me/post/" + bookId);
    var aHandler = await page.$("#content > p.date > a:nth-child(2)");
    //console.log("aHandler: ", aHandler);
    var sort_code = (await page.evaluate(e => e.href, aHandler)).match(/\d+/)[0];
    page.close();

    return sort_code;
}

/* GET headless listing. */
router.get('/', async function(req, res, next) {
    //appid must be a numeric
    var appId = req.query.appid;
    var pageId = 10;
    var sortId = 23;

    //load execute function
    var appPath = "../app/" + appId + "/app.js";
    var app = require(appPath);

    var mysql = require("mysql");
    var conn = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'mysql0411',
        database : 'crawler_data'
    });

    conn.connect();
    //console.log(conn);

    var catelogUrl = "http://www.zxcs.me/sort/" + sortId;
    var cateName = "历史·军事";

    var maxPage = 50;
    var pageTemplate = "/page/%d";

    var pageNo = pageId;

    while (pageNo > 0) {

        console.log("=========== PAGE " + pageNo + " ============")

        var url = catelogUrl + util.format(pageTemplate, pageNo);

        //selector
        //#plist > dt > a
        // //*[@id="plist"]/dt/a
        var p = await loadPage(url);

        if (typeof p == "string") {
            console.log("!!!!!!!load page fail .... retry");
            continue;
        }

        var books = await p.$x("//*[@id=\"plist\"]/dt/a");

        var book_list = [];
        var html = "<table>";

        for (var i = 0; i < books.length; i++) {
            var text = await p.evaluate(e => e.text, books[i]);
            var bookName = text.replace("《", "").match(/[\WA-Za-z0-9_]+(?=》)/)[0];
            var bookMainUrl = await p.evaluate(e => e.href, books[i]);
            var bookId = bookMainUrl.match(/\d+/)[0];
            var dlPageUrl = 'http://www.zxcs.me/download.php?id=' + bookId;

            var dlPage = await loadPage(dlPageUrl);

            var status = 0;
            if (typeof dlPage == "string") {
                //try again
                dlPage = await loadPage(dlPageUrl);
                if (typeof dlPage == "string") {
                    status = -1;
                }
            }

            var dlUrl = "";

            if (status === 0) {
                var dlUrlHandler = await dlPage.$("span.downfile > a");
                dlUrl = await dlPage.evaluate(e => e.href, dlUrlHandler);
            }

            book_list.push({
                text,
                bookName,
                bookMainUrl,
                bookId,
                dlPageUrl,
                dlUrl,
                status
            });

            console.log(text, bookName, bookMainUrl, bookId, dlPageUrl, dlUrl);
            console.log("--------------------------");

            var sql = 'INSERT INTO `crawler_data`.`zxcs_books` (`name`, `book_id`, `status`, `page_url`, `rar_url`, `full_text`) VALUES(?,?,?,?,?,?)';
            var params = [bookName, bookId, status, bookMainUrl, dlUrl, text];

            conn.query(sql, params, function (err, result) {
                if (err) {
                    console.log('[INSERT ERROR] - ', err.message);
                    return;
                }
            });

            await exec("wget -O \"./dl/" + bookName + "-" + bookId + ".rar\" " + dlUrl);

            // html += "<tr>"
            //     + "<td>" + bookId + "</td>"
            //     + "<td>" + bookName + "</td>"
            //     + "<td>" + text + "</td>"
            //     + "<td>" + dlUrl + "</td>"
            //     + "</tr>";

            await dlPage.close();
        }

        // html += "</table>";

        await p.close();

        pageNo --;

    }
    //res.send(html);

    // if (typeof html == "string")
    //     res.send(value);
    // else
    //     html.then(function(value) {
    //         res.send(value);
    //     });
});

router.get('/buildscprit', async function (req, res, next) {
    var sortId = req.query.sortid;

    var mysql = require("mysql");
    var conn = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'mysql0411',
        database : 'crawler_data'
    });

    conn.connect();

    let list = await (function () {
        return new Promise(function(resolve, reject) {
            conn.query("select * from zxcs_books where sort_id = " + sortId, function (err, result) {

                if (err) {
                    console.log('[INSERT ERROR] - ', err.message);
                    res.send("500 error");
                    resolve();
                }
                var list = '';
                for (var i = 0; i < result.length; i++) {
                    var e = result[i];
                    list += "wget -O \"./dl_" + sortId + "/" + e.name + "-" + e.book_id + ".rar\" \"" + e.rar_url + "\"\n";
                }

                resolve(list);
            })
        })
    })();

    res.send(list);


});

router.get('/getrecent', async function (req, res, next) {
    var mysql = require("mysql");
    var conn = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'mysql0411',
        database : 'crawler_data'
    });

    var crawler_url = 'http://www.zxcs.me/map.html';
    var p = await loadPage(crawler_url);
    
    //get title list
    var a = await p.$$("#content ul li a");

    if (!a.length) 
        return res.send("empty");

    var book_list = [];
    var html = "";

    for (var i = 0; i < a.length; i++) {
        //e is an object
        var e = a[i];

        var bookMainUrl = await p.evaluate(ele => ele.href, e);
        var text = await p.evaluate(ele => ele.text, e);

        var bookName = text.replace("《", "").match(/[\WA-Za-z0-9_]+(?=》)/)[0];
        var bookId = bookMainUrl.match(/\d+/)[0];
        var dlPageUrl = 'http://www.zxcs.me/download.php?id=' + bookId;

        var dlPage = await loadPage(dlPageUrl);

        var status = 0;
        if (typeof dlPage == "string") {
            //try again
            dlPage = await loadPage(dlPageUrl);
            if (typeof dlPage == "string") {
                status = -1;
            }
        }

        var dlUrl = "";

        if (status === 0) { //the page is loaded!
            var dlUrlHandler = await dlPage.$("span.downfile > a");
            dlUrl = await dlPage.evaluate(ele => ele.href, dlUrlHandler);

            await dlPage.close();
        }

        var sortId = await getSortId(bookId);

        book_list.push({
            text,
            bookName,
            bookMainUrl,
            bookId,
            dlPageUrl,
            dlUrl,
            sortId,
            status
        });

        console.log(text, bookName, bookMainUrl, bookId, dlPageUrl, dlUrl);
        console.log("--------------------------");

        var sql = 'INSERT INTO `crawler_data`.`zxcs_books` (`name`, `book_id`, `status`, `page_url`, `rar_url`, `full_text`, `sort_id`) VALUES(?,?,?,?,?,?,?)';
        var params = [bookName, bookId, status, bookMainUrl, dlUrl, text, sortId];

        conn.query(sql, params, function (err, result) {
            if (err) {
                console.log('[INSERT ERROR] - ', err.message);
                return;
            }
        });

        var wget_script = "wget -O \"./dl_recent/" + bookName + "-" + bookId + ".rar\" " + dlUrl;
        //await exec(wget_script);

        html +=
         "<tr>"
            + "<td>" + bookId + "</td>"
            + "<td>" +sortId + "</td>"
            + "<td>" + bookName + "</td>"
            + "<td>" + text + "</td>"
            + "<td>" + dlUrl + "</td>"
            + "<td>" + wget_script + "</td>"
            + "</tr>";
    }

    res.send(html);
    
    // a.forEach(async e => { //e a标签对象
    //     var bookMainUrl = await p.evaluate(ele => ele.href, e);
    //     var text = await p.evaluate(ele => ele.text, e);

    //     var bookName = text.replace("《", "").match(/[\WA-Za-z0-9_]+(?=》)/)[0];
    //     var bookId = bookMainUrl.match(/\d+/)[0];
    //     var dlPageUrl = 'http://www.zxcs.me/download.php?id=' + bookId;

    //     var dlPage = await loadPage(dlPageUrl);

    //     var status = 0;
    //     if (typeof dlPage == "string") {
    //         //try again
    //         dlPage = await loadPage(dlPageUrl);
    //         if (typeof dlPage == "string") {
    //             status = -1;
    //         }
    //     }

    //     var dlUrl = "";

    //     if (status === 0) {
    //         var dlUrlHandler = await dlPage.$("span.downfile > a");
    //         dlUrl = await dlPage.evaluate(ele => ele.href, dlUrlHandler);

    //         await dlPage.close();
    //     }

    //     book_list.push({
    //         text,
    //         bookName,
    //         bookMainUrl,
    //         bookId,
    //         dlPageUrl,
    //         dlUrl,
    //         status
    //     });

    //     console.log(text, bookName, bookMainUrl, bookId, dlPageUrl, dlUrl);
    //     console.log("--------------------------");

    //     var sql = 'INSERT INTO `crawler_data`.`zxcs_books` (`name`, `book_id`, `status`, `page_url`, `rar_url`, `full_text`) VALUES(?,?,?,?,?,?)';
    //     var params = [bookName, bookId, status, bookMainUrl, dlUrl, text];

    //     conn.query(sql, params, function (err, result) {
    //         if (err) {
    //             console.log('[INSERT ERROR] - ', err.message);
    //             return;
    //         }
    //     });

    //     var wget_script = "wget -O \"./dl_recent/" + bookName + "-" + bookId + ".rar\" " + dlUrl;
    //     //await exec(wget_script);

    //     html += "<tr>"
    //         + "<td>" + bookId + "</td>"
    //         + "<td>" + bookName + "</td>"
    //         + "<td>" + text + "</td>"
    //         + "<td>" + dlUrl + "</td>"
    //         + "<td>" + wget_script + "</td>"
    //         + "</tr>";

    // }); 
    

    
    
});


module.exports = router;
