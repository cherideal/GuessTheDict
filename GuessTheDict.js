'use strict';

var DepositeContent = function (text) {
    if (text) {
        var o = JSON.parse(text);
        this.balance = new BigNumber(o.balance);
        this.point = new BigNumber(o.point);
        if (this.balance.isNaN()){
            this.balance = new BigNumber(0);
        }
        if (this.point.isNaN()){
            this.point = new BigNumber(0);
        }
    }
    else {
        this.balance = new BigNumber(0);
        this.point = new BigNumber(0);
    }

    this.bonus = new BigNumber(0);
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
        this.actorNumber = 0;
    },

    start: function(actorNumber) {
        if (this.state){
            throw new Error("The game is started already");
        }

        var number = new BigNumber(actorNumber);
        if (!number.isInteger()){
            throw new Error("Invalid actor number");
        }
        this.actorNumber = number.integerValue();
        if(this.actorNumber <= 0){
            this.actorNumber = 2;
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
        this.actorNumber = 0;
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

        point = new BigNumber(point);
        if (!point.isInteger() || point.isLessThan(0)){
            throw new Error("Invalid input value");
        }

        if (point.isZero() || point.isNAN()){
            point = 6;
        }
        else{
            point = point.absoluteValue().modulo(6);
        }

        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;

        var index = this.size;
        var orig_info = this.dataMap.get(from);
        if (orig_info) {
            value = value.plus(orig_info.balance);
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

        if (this.actorNumber >= this.size){
            this._stop()
        }
    },

    _genPoint: function () {
        BigNumber.config({ CRYPTO: true })
        var rand = BigNumber.random();
        var point = rand.multipliedBy(6).decimalPlaces(0, 1);
        return point ? (point.integerValue() % 6) : 6;
    },

    _assign: function () {
        var point = this._genPoint();
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
                if (winer.amount.isGreaterThanOrEqualTo(accounts[i].amount)){
                    deposit.bonus = new BigNumber(0);
                }
                else{
                    deposit.bonus = (accounts[i].amount.minus(winer.amount)).
                                     multipliedBy(deposit.balance.dividedBy(accounts[i].amount));
                }

                this.dataMap.set(key, deposit);
            }
        }

        var rewardsTotal = new BigNumber(0);
        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = this.dataMap.get(key);
            //winer's balance == bonus
            rewardsTotal = rewardsTotal.plus(deposit.balance.minus(deposit.bonus));
        }

        var charges = rewardsTotal.multipliedBy(0.05);
        var rewards = rewardsTotal.minus(charges);
        for (var i = 0; i < winer.keys.length; i++){
            key = winer.keys[i];
            var deposit = this.dataMap.get(key);
            deposit.bonus = deposit.bonus.plus(deposit.balance.dividedBy(winer.amount).multipliedBy(rewards));
            this.dataMap.set(key, deposit);
        }

        for (var i = 0; i < this.size; i++){
            var key = this.arrayMap.get(i);
            var deposit = this.dataMap.get(key);
            var bonus = deposit.bonus;
            if (bonus.isZero()){
                continue;
            }

            var result = Blockchain.transfer(key, bonus);
            if (!result) {
                throw new Error("transfer failed.");
            }

            Event.Trigger("RewardDistribute", {
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
        Event.Trigger("CommissionDistribute", {
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
