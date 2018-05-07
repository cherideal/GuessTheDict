'use strict';

var DepositeContent = function (text) {
    if (text) {
        var o = JSON.parse(text);
        this.balance = new BigNumber(o.balance);
        this.point = Number.parseInt(o.point);
        if (Number.isNaN(this.point)){
            this.point = 0;
        }
    } else {
        this.balance = new BigNumber(0);
        this.point = 0;
    }
};

DepositeContent.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

var GuessTheDictContract = function () {
    LocalContractStorage.defineMapProperty(this, "dataMap", {
        parse: function (text) {
            return new DepositeContent(text);
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
    },

    start: function() {
        if (this.state) {
            throw new Error("The game is started already");
        }
        this.publisher = Blockchain.transaction.from;
        this.state = true;
        console.log("Please start to guess the dict now!")
    },

    stop: function() {
        if (!this.state) {
            throw new Error("The game is stop already");
        }
        if (this.publisher != Blockchain.transaction.from) {
            throw new Error("Only publisher can stop the game manually");
        }

        this.state = false;
        console.log("Start to assign the award now!");
        _assign();
        _clear();
    },

    _stop: function() {
        this.state = false;
        console.log("Start to assign the award now!");
        _assign();
        _clear();
    },

    _clear: function() {
        this.publisher = 0;
        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            this.arrayMap.del(i);
            this.dataMap.del(key);
        }
        this.size=0;
    },

    action: function (point) {
        if (!this.state) {
            throw new Error("The game is stop already");
        }

        if (!Number.IsInteger(point)){
            throw new Error("Invalid input value");
        }

        point = Number.parseInt(point);
        if (0 == point || Number.isNaN(point)){
            point = 6;
        }
        else{
            point = point % 6;
        }

        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;

        var index = this.size;
        var orig_deposit = this.dataMap.get(from);
        if (orig_deposit) {
            value = value.plus(orig_deposit.balance);
        }
        else{
            this.arrayMap.set(index, from);
            this.size += 1;
        }

        var deposit = new DepositeContent();
        deposit.balance = value;
        deposit.point = point;

        this.dataMap.put(from, deposit);
    },

    _genPoint: function () {
        var buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer ? (buffer % 6) : 6;
    },

    _assign: function () {
        var point = _genPoint();
        var amount = new BigNumber(0);
        var accounts = [7];
        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = dataMap.get(key);
            accounts[deposit.point].key = key;
            accounts[deposit.point].amount = accounts[deposit.point].amount.plus(deposit.balance);
        }

        var winers = accounts[point];

        for (var i = 0; i < this.size; i++){

        }

        var deposit = this.bankVault.get(from);
        if (!deposit) {
            throw new Error("No deposit before.");
        }

        if (bk_height.lt(deposit.expiryHeight)) {
            throw new Error("Can not takeout before expiryHeight.");
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
