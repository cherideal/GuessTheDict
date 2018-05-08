'use strict';

var DictContent = function (text) {
    if (text) {
        var o = JSON.parse(text);
        this.balance = new BigNumber(o.balance);
        this.point = new BigNumber(o.point);
        if (this.balance.isNaN()) {
            this.balance = new BigNumber(0);
        }
        if (this.point.isNaN()) {
            this.point = new BigNumber(0);
        }
    }
    else {
        this.balance = new BigNumber(0);
        this.point = new BigNumber(0);
    }

    this.bonus = new BigNumber(0);
};

DictContent.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

var DepositeContent = function (text) {
    if (text) {
        var o = JSON.parse(text);
        this.balance = new BigNumber(o.balance);
    } else {
        this.balance = new BigNumber(0);
    }
};

DepositeContent.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

var GuessTheDictContract = function () {
    LocalContractStorage.defineMapProperty(this, "bankVault", {
        parse: function (text) {
            return new DepositeContent(text);
        },
        stringify: function (o) {
            return o.toString();
        }
    });
    LocalContractStorage.defineMapProperty(this, "dataMap", {
        parse: function (text) {
            return new DictContent(text);
        },
        stringify: function (o) {
            return o.toString();
        }
    });
    LocalContractStorage.defineMapProperty(this, "arrayMap");
    LocalContractStorage.defineProperty(this, "size");
};

// save value to contract, only after height of block, users can takeout
GuessTheDictContract.prototype = {
    init: function () {
        this.owner = Blockchain.transaction.from;
        this.size = 0;
        this.actorNumber = 0;
    },

    _save2bank: function (address, value) {
        var orig_deposit = this.bankVault.get(address);
        if (orig_deposit) {
            value = value.plus(orig_deposit.balance);
        }

        var deposit = new DepositeContent();
        deposit.balance = value;

        this.bankVault.put(address, deposit);
    },

    _save2dict: function (address, value, point) {
        var index = this.size;
        var orig_info = this.dataMap.get(address);
        if (orig_info) {
            value = value.plus(orig_info.balance);
        }
        else {
            this.arrayMap.set(index, address);
            this.size += 1;
        }

        var dict = new DictContent();
        dict.balance = value;
        dict.point = point;
        dict.bonus = value;

        this.dataMap.put(address, dict);
    },

    _stop: function () {
        this.state = false;
        console.log("Start to assign the award now!");
        this._assign();
        this._clear();
    },

    _clear: function () {
        this.publisher = 0;
        this.actorNumber = 0;
        for (var i = 0; i < this.size; i++) {
            var key = this.arrayMap.get(i);
            this.arrayMap.del(i);
            this.dataMap.del(key);
        }
        this.size = 0;
    },

    _takeout: function (address, value) {
        var deposit = this.bankVault.get(address);
        if (deposit){
            deposit.balance = deposit.balance.sub(value);
            this.bankVault.put(address, deposit);
        }
    },

    _genPoint: function () {
        BigNumber.config({CRYPTO: true})
        var rand = BigNumber.random();
        var point = rand.times(6).decimalPlaces(0, 1);
        return point ? (point.integerValue() % 6) : 6;
    },

    _assign: function () {
        var point = this._genPoint();
        var accounts = [7];
        for (var i = 0; i < 7; i++) {
            accounts[i].amount = new BigNumber(0);
            accounts[i].keys = [];
        }

        for (var i = 0; i < this.size; i++) {
            var key = this.arrayMap.get(i);
            var dict = this.dataMap.get(key);
            accounts[dict.point].keys.append(key);
            accounts[dict.point].amount = accounts[dict.point].amount.plus(dict.balance);
        }

        var winer = accounts[point];
        for (var i = 1; i < 7; i++) {
            if (i == point) {
                continue;
            }

            for (var j = 0; j < accounts[i].keys.length; j++) {
                var dict = this.dataMap.get(key);
                if (winer.amount.gte(accounts[i].amount)) {
                    dict.bonus = new BigNumber(0);
                }
                else {
                    dict.bonus = (accounts[i].amount.minus(winer.amount)).times(dict.balance.div(accounts[i].amount));
                }

                this.dataMap.set(key, dict);
            }
        }

        var rewardsTotal = new BigNumber(0);
        for (var i = 0; i < this.size; i++) {
            var key = this.arrayMap.get(i);
            var dict = this.dataMap.get(key);
            //winer's balance == bonus
            rewardsTotal = rewardsTotal.plus(dict.balance.minus(dict.bonus));
        }

        var charges = rewardsTotal.multipliedBy(0.05);
        var rewards = rewardsTotal.minus(charges);
        for (var i = 0; i < winer.keys.length; i++) {
            key = winer.keys[i];
            var dict = this.dataMap.get(key);
            dict.bonus = dict.bonus.plus(dict.balance.div(winer.amount).times(rewards));
            this.dataMap.set(key, dict);
        }

        for (var i = 0; i < this.size; i++) {
            var key = this.arrayMap.get(i);
            var dict = this.dataMap.get(key);
            var bonus = dict.bonus;
            if (bonus.isZero()) {
                continue;
            }

            this._save2bank(key, bonus);
        }

        this._save2bank(this.owner, charges);
    },

    save: function () {
        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;
        this._save2bank(from, value);
    },

    takeout: function (value) {
        var from = Blockchain.transaction.from;
        var amount = new BigNumber(value);

        var deposit = this.bankVault.get(from);
        if (!deposit) {
            throw new Error("No deposit before.");
        }

        if (amount.gt(deposit.balance)) {
            throw new Error("Insufficient balance.");
        }

        var result = Blockchain.transfer(from, amount);
        if (!result) {
            throw new Error("transfer failed.");
        }
        Event.Trigger("BankVault", {
            Transfer: {
                from: Blockchain.transaction.to,
                to: from,
                value: amount.toString()
            }
        });

        deposit.balance = deposit.balance.sub(amount);
        this.bankVault.put(from, deposit);
    },

    start: function (actorNumber) {
        if (this.state) {
            throw new Error("The game is started already");
        }

        var number = new BigNumber(actorNumber);
        if (!number.isInteger()) {
            throw new Error("Invalid actor number");
        }
        this.actorNumber = number.integerValue();
        if (this.actorNumber <= 0) {
            this.actorNumber = 2;
        }

        this.publisher = Blockchain.transaction.from;
        this.state = true;

        console.log("Please start to guess the dict now!")
    },

    stop: function () {
        if (!this.state) {
            throw new Error("The game is stop already");
        }

        this.state = false;
        console.log("Start to assign the award now!");
        this._assign();
        this._clear();
    },

    action: function (point, funds) {
        if (!this.state) {
            throw new Error("The game is stop already");
        }

        point = new BigNumber(point);
        if (!point.isInteger() || point.lt(0) || funds.lt(0)) {
            throw new Error("Invalid input value");
        }

        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;

        this._save2bank(from, value);

        var deposit = this.bankVault.get(from);
        if (deposit.lte(funds)){
            funds = deposit.balance;
        }

        if (point.isZero() || point.isNAN()) {
            point = 6;
        }
        else {
            point = point.abs().mod(6);
        }

        //funds <= deposit
        this._takeout(funds);
        this._save2dict(from, funds, point);

        if (this.actorNumber >= this.size) {
            this._stop()
        }
    },

    balanceOf: function () {
        var from = Blockchain.transaction.from;
        return this.dataMap.get(from);
    },

    verifyAddress: function (address) {
        // 1-valid, 0-invalid
        var result = Blockchain.verifyAddress(address);
        return {
            valid: result == 0 ? false : true
        };
    }
};
module.exports = GuessTheDictContract;
