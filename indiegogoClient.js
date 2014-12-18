var indiegogo = {};

var request = require('request');
var cheerio = require('cheerio');
var parse = require('csv-parse');

var session = indiegogo.session = function(email, password, cb)
{
    this._urlRoot = 'https://www.indiegogo.com';
    this._ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2193.0 Safari/537.36';
    this._email = email;
    this._password = password;
    this._jar = request.jar()

    var s = this;

    this.getAuthenticityToken(function(token)
    {
        s._token = token;
        s.login(function()
        {
            console.log("login complete");
            cb(true);
        }, function()
        {
            console.log("login failed");
            cb(false);
        });
    });
}

session.prototype.getAuthenticityToken = function(success, error)
{
    var options = {
        url: this._urlRoot,
        jar: this._jar,
        headers: {
            'User-Agent': this._ua,
        }
    };

    request(options, function(error, response, body)
    {
        if(!error)
        {
            $ = cheerio.load(body);
            var token = $('input[name="authenticity_token"]').val();

            success(token);
        }

    });
}

session.prototype.login = function(success, err)
{
    var s = this;

    var options = {
        url: this._urlRoot + '/accounts/sign_in',
        jar: this._jar,
        headers: {
            'User-Agent': this._ua,
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': this._token,
            'Referer': this._urlRoot,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
        form: {
            'authenticity_token': this._token,
            'account': {email: this._email, password: this._password, rememberme: 1},
        }
    };

    request.post(options, function(error, response, body)
    {
        if(!error && response.statusCode == 201)
        {
            success();
        }
        else
        {
            err();
        }
    });
}

var _parseAmount = function(str)
{
    var currency = str[0];
    var value    = str.substr(1);

    var currencyMap = {
        '€': 'EUR',
        '$': 'USD',
        '£': 'GBP',
    };

    if (currency in currencyMap)
        currency = currencyMap[currency];

    return {value: value, currency: currency};

}

session.prototype.fetchFulfillments = function(slug, cb)
{
    var options = {
        url: this._urlRoot + '/command_center/' + slug + '/fulfillments.csv',
        jar: this._jar,
        headers: {
            'User-Agent': this._ua,
        }
    };

    request(options, function(error, response, body)
    {
        var parser = parse();
        var heading = false;
        parser.on('readable', function(){

            while(record = parser.read())
            {
                if(!heading)
                {
                    heading = true;
                    continue;
                }

                try
                {
                    var zip = record[15].trim();

                    // fix bogus padding
                    if(zip[0] == '=' && zip[1] == '"')
                        zip = zip.substr(2);

                    var perk;

                    var perkId = parseInt(record[0]);
                    if(isNaN(perkId))
                        perk = null;
                    else
                        perk = {id: perkId, name: record[9].trim()};

                    var _record = {
                        pledgeId:  parseInt(record[1]),
                        status:    record[2].trim(),
                        date:      new Date(Date.parse(record[3])),
                        paymentMethod: record[4].trim(),
                        appearance: record[5].trim().toLowerCase(),
                        name: record[6].trim(),
                        email: record[7].trim(),
                        amount: _parseAmount(record[8].trim()),
                        perk: perk,
                        shippingName: record[10].trim(),
                        shippingAddress: record[11].trim(),
                        shippingAddress2: record[12].trim(),
                        shippingCity: record[13].trim(),
                        shippingState: record[14].trim(),
                        shippingZip: zip,
                        shippingCountry: record[16].trim()
                    };

                    if(!_record.name)
                        _record.name = _record.shippingName;

                    cb(_record);

                }
                catch(e)
                {
                     console.log(e);
                }
            }
        });

        parser.write(body);
    });
};

module.exports = indiegogo;

