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

    this.bonus = this.balance;
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
        this._assign();
        this._clear();
    },

    _stop: function() {
        this.state = false;
        console.log("Start to assign the award now!");
        this._assign();
        this._clear();
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
        deposit.bonus = value;

        this.dataMap.put(from, deposit);
    },

    _genPoint: function () {
        var buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer ? (buffer % 6) : 6;
    },

    _assign: function () {
        var point = this._genPoint();
        var amount = new BigNumber(0);
        var accounts = [7];
        for (var i = 0; i < 7; i++){
            accounts[i].amount = new BigNumber(0);
            accounts[i].keys = [];
        }

        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = this.dataMap.get(key);
            accounts[deposit.point].keys.append(key);
            accounts[deposit.point].amount = accounts[deposit.point].amount.plus(deposit.balance);
        }

        var winer = accounts[point];

        for (var i = 1; i < 7; i++){
            if (i == point){
                continue;
            }

            for (var j = 0; j < accounts[i].keys.length; j++){
                var deposit = this.dataMap.get(key);
                if (winer.amount >= accounts[i].amount){
                    deposit.bonus = new BigNumber(0);
                }
                else{
                    deposit.bonus = (accounts[i].amount - winer.amount) * (deposit.balance/accounts[i].amount)
                }

                this.dataMap.set(key, deposit);
            }
        }

        var rewards = new BigNumber(0);
        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = this.dataMap.get(key);
            //winer's balance == bonus
            rewards = rewards.plus(deposit.balance - deposit.bonus);
        }

        var charges = rewards / 20;
        rewards = rewards - charges;
        for (var i = 0; i < winer.keys.length; i++){
            key = winer.keys[i];
            var deposit = this.dataMap.get(key);
            deposit.bonus = deposit.bonus + deposit.balance/winer.amount*rewards;
            this.dataMap.set(key, deposit);
        }

        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = this.dataMap.get(key);
            var bonus = deposit.bonus;
            var result = Blockchain.transfer(key, bonus);
            if (!result) {
                throw new Error("transfer failed.");
            }

            Event.Trigger("BankVault", {
                Transfer: {
                    from: Blockchain.transaction.to,
                    to: key,
                    value: bonus.toString()
                }
            });
        }

        var result = Blockchain.transfer(this.owner, charges);
        if (!result) {
            throw new Error("transfer failed.");
        }
        Event.Trigger("BankVault", {
            Transfer: {
                from: Blockchain.transaction.to,
                to: this.owner,
                value: charges.toString()
            }
        });
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
