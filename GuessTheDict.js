'use strict';

var DepositeContent = function (text) {
    if (text) {
        var o = JSON.parse(text);
        this.balance = new BigNumber(o.balance);
        this.point = new BigNumber(o.point);
    } else {
        this.balance = new BigNumber(0);
        this.point = new BigNumber(0);
    }
};

DepositeContent.prototype = {
    toString: function () {
        return JSON.stringify(this);
    }
};

var BankVaultContract = function () {
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
BankVaultContract.prototype = {
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

    action: function () {
        if (!this.state) {
            throw new Error("The game is stop already");
        }
        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;

        var orig_deposit = this.bankVault.get(from);
        if (orig_deposit) {
            value = value.plus(orig_deposit.balance);
        }

        var deposit = new DepositeContent();
        deposit.balance = value;

        this.bankVault.put(from, deposit);
    },

    _assign: function () {
        var from = Blockchain.transaction.from;
        var bk_height = new BigNumber(Blockchain.block.height);
        var amount = new BigNumber(value);

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
        return this.bankVault.get(from);
    },
    verifyAddress: function (address) {
        // 1-valid, 0-invalid
        var result = Blockchain.verifyAddress(address);
        return {
            valid: result == 0 ? false : true
        };
    }
};
module.exports = BankVaultContract;
