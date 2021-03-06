import './defi.types.js';
import gql from 'graphql-tag';
import { isObjectEmpty, lowercaseFirstChar } from '../../utils';
import web3utils from 'web3-utils';

/** @type {BNBridgeExchange} */
export let defi = null;

/**
 * Plugin for various DeFi requests and calculations.
 */
export class DeFi {
    /**
     * @param {Vue} _Vue
     * @param {{apolloClient: ApolloClient}} _options
     */
    static install(_Vue, _options) {
        if (!defi) {
            defi = new DeFi(_options);
            _Vue.prototype.$defi = defi;
        }
    }

    /**
     * @param {{apolloClient: ApolloClient}} _options
     */
    constructor(_options) {
        this.apolloClient = _options.apolloClient;
        /** Liquidation collateral ratio. */
        this.liqCollateralRatio = 1.5;
        /** Minimal collateral ratio. */
        this.minCollateralRatio = 3;
        /** Warning collateral ratio. */
        this.warningCollateralRatio = 2.25; // (this.liqCollateralRatio + this.minCollateralRatio) / 2;
        /** DeFi settings was loaded. */
        this.settingsLoaded = false;
    }

    /**
     * Load settings if it's necessary.
     *
     * @return {Promise}
     */
    async init() {
        if (!this.settingsLoaded) {
            this.settingsLoaded = true;
            this.initProperties(await this.fetchSettings());
        }
    }

    /**
     * Set properties.
     *
     * @param {DefiSettings} _settings
     */
    initProperties(_settings) {
        const dec = Math.pow(10, _settings.decimals);

        this.liqCollateralRatio = parseInt(_settings.liqCollateralRatio4, 16) / dec;
        this.minCollateralRatio = parseInt(_settings.minCollateralRatio4, 16) / dec;
        this.warningCollateralRatio = parseInt(_settings.warningCollateralRatio4, 16) / dec;
    }

    /**
     * @param {number} _collateral
     * @param {number} _tokenPrice
     * @return {number}
     */
    getMaxDebt(_collateral, _tokenPrice) {
        let max = 0;

        if (_collateral > 0) {
            max = (_collateral * _tokenPrice) / this.minCollateralRatio;
        }

        return max;
    }

    getMaxDebtFUSD(_collateralFUSD) {
        return _collateralFUSD > 0 ? _collateralFUSD / this.minCollateralRatio : 0;
    }

    /**
     * @param {number} _debt
     * @param {number} _collateral
     * @return {number}
     */
    getLiquidationPrice(_debt, _collateral) {
        let liqPrice = 0;

        if (_debt > 0 && _collateral > 0) {
            liqPrice = (_debt * this.liqCollateralRatio) / _collateral;
        }

        return liqPrice;
    }

    getMintingLimit(_debt, _collateral, _tokenPrice) {
        // ratio between actual debt and liquidation debt
        return _collateral > 0
            ? (_debt / ((parseFloat(_collateral) * _tokenPrice) / this.liqCollateralRatio)) * 100
            : 0;
    }

    getMintingLimitFUSD(_debt, _collateralFUSD) {
        // ratio between actual debt and liquidation debt
        return _collateralFUSD > 0 ? (_debt / (_collateralFUSD / this.liqCollateralRatio)) * 100 : 0;
    }

    /**
     * Get color values for f-circle-progress and f-colored-number-range components
     *
     * @return {{color: string, value: number}[]}
     */
    getColors() {
        return [
            {
                value: (this.liqCollateralRatio / this.minCollateralRatio) * 100,
                color: '#ffaf19',
            },
            {
                value: (this.warningCollateralRatio / this.minCollateralRatio) * 100,
                color: '#ff1716',
            },
        ];
    }

    /**
     * @param {number} _debt
     * @param {number} _tokenPrice
     * @return {number}
     */
    getMinCollateral(_debt, _tokenPrice) {
        return (_debt * this.minCollateralRatio) / _tokenPrice;
    }

    /**
     * @param {DefiToken} _token
     * @return {string}
     */
    getTokenSymbol(_token) {
        return _token && _token.symbol ? lowercaseFirstChar(_token.symbol) : '';
    }

    /**
     * @param {DefiToken} _token
     * @return {number}
     */
    getTokenPrice(_token) {
        return _token && 'price' in _token ? parseInt(_token.price, 16) / Math.pow(10, _token.priceDecimals) : 0;
    }

    /**
     * Convert given value from token decimals space.
     *
     * @param {string} _value Hex value.
     * @param {DefiToken} _token
     * @param {boolean} [_isPrice]
     */
    fromTokenValue(_value, _token, _isPrice = false) {
        let value = 0;

        if (_value !== undefined && !isNaN(_value)) {
            value = parseFloat(this.shiftDecPointLeft(_value, _isPrice ? _token.priceDecimals : _token.decimals));
        }

        return value;
    }

    /**
     * Convert given value to token decimals space.
     *
     * @param {string} _value
     * @param {DefiToken} _token
     * @param {boolean} [_isPrice]
     */
    toTokenValue(_value, _token, _isPrice = false) {
        let value = 0;

        if (_value !== undefined && !isNaN(_value)) {
            value = parseFloat(
                this.shiftDecPointRight(_value.toString(), _isPrice ? _token.priceDecimals : _token.decimals)
            );
        }

        return value;
    }

    /**
     * @param {string} _value
     * @param {number} _dec Number of decimals.
     * @return {string}
     */
    shiftDecPointLeft(_value, _dec = 0) {
        const value = web3utils.toBN(_value).toString(10);
        const idx = value.length - _dec;

        if (idx < 0) {
            return `0.${web3utils.padLeft(value, _dec, '0')}`;
        } else {
            return value.slice(0, idx) + '.' + value.slice(idx);
        }
    }

    /**
     * @param {string} _value
     * @param {number} _dec Number of decimals.
     * @param {boolean} [_float] Don't remove decimals.
     * @return {string}
     */
    shiftDecPointRight(_value, _dec = 0, _float = false) {
        const value = _value.toString();
        let idx = value.indexOf('.');
        let left;
        let right;
        let res = '';

        if (idx > -1) {
            left = value.slice(0, idx);
            right = value.slice(idx + 1);

            if (_dec < right.length) {
                res = left + right.slice(0, _dec) + '.' + right.slice(_dec);
            } else if (_dec === right.length) {
                res = left + right;
            } else {
                res = left + web3utils.padRight(right, _dec, '0');
            }
        } else {
            res = value + web3utils.padRight('', _dec, '0');
        }

        // remove leading zeros
        while (res.length > 0 && res.charAt(0) === '0') {
            res = res.slice(1);
        }

        if (!_float) {
            idx = res.indexOf('.');
            if (idx > -1) {
                res = res.slice(0, idx);
            }

            if (!res) {
                res = '0';
            }
        }

        return res;
    }

    /**
     * @param {string} _value
     * @param {number} _decimals
     * @return {string}
     */
    shiftDecPoint(_value, _decimals) {
        const value = _value.toString();

        if (_decimals === 0) {
            return value;
        } else if (_decimals < 0) {
            return this.shiftDecPointLeft(value, -_decimals);
        } else {
            return this.shiftDecPointRight(value, _decimals);
        }
    }

    /**
     * Value and result value are both in "WEI".
     *
     * @param {string|number} _value Value in `_token` decimal space.
     * @param {DefiToken} _token
     * @param {DefiToken} _toToken
     * @return {string}
     */
    convertTokenValueWEI(_value, _token, _toToken) {
        if (isObjectEmpty(_token) || isObjectEmpty(_toToken)) {
            return '';
        }

        const value = web3utils.toBN(_value);
        const tokenPrice = web3utils.toBN(_token.price);
        const toTokenPrice = web3utils.toBN(_toToken.price);
        const result = value.mul(tokenPrice).div(toTokenPrice).toString(10);
        const resultDecimals = _toToken.decimals - (_token.decimals + _token.priceDecimals - _toToken.priceDecimals);

        return this.shiftDecPoint(result, resultDecimals);
    }

    /**
     * Value and result value are converted from "WEI".
     *
     * @param {string|number} _value Value in `_token` decimal space.
     * @param {DefiToken} _token
     * @param {DefiToken} _toToken
     * @return {string}
     */
    convertTokenValue(_value, _token, _toToken) {
        return this.fromTokenValue(
            this.convertTokenValueWEI(this.toTokenValue(_value, _token), _token, _toToken),
            _toToken
        );
    }

    /**
     * Get defi account debt by token.
     *
     * @param {DefiAccount} _account
     * @param {DefiToken} _token
     * @return {DefiTokenBalance|{}}
     */
    getDefiAccountDebt(_account, _token) {
        let debt = 0;
        let acountDebt;

        if (_token && _account && _account.debt && _account.debt.length > 0) {
            acountDebt = _account.debt.find((_item) => _item.tokenAddress === _token.address);
            if (acountDebt) {
                debt = acountDebt;
            }
        }

        return debt;
    }

    /**
     * Get defi account collateral by token.
     *
     * @param {DefiAccount} _account
     * @param {DefiToken} _token
     * @return {DefiTokenBalance|{}}
     */
    getDefiAccountCollateral(_account, _token) {
        let collateral = 0;
        let acountCollateral;

        if (_token && _account && _account.collateral && _account.collateral.length > 0) {
            acountCollateral = _account.collateral.find((_item) => _item.tokenAddress === _token.address);
            if (acountCollateral) {
                collateral = acountCollateral;
            }
        }

        return collateral;
    }

    /**
     * @param {DefiToken} _token
     * @return {boolean}
     */
    canTokenBeBorrowed(_token) {
        return _token && _token.isActive && _token.canBorrow && _token.symbol !== 'FUSD';
    }

    /**
     * @param {DefiToken} _token
     * @return {boolean}
     */
    canTokenBeTraded(_token) {
        return _token && _token.isActive && _token.canTrade;
    }

    /**
     * @return {Promise<DefiSettings>}
     */
    async fetchSettings() {
        const data = await this.apolloClient.query({
            query: gql`
                query DefiSettings {
                    defiConfiguration {
                        tradeFee4
                        loanFee4
                        minCollateralRatio4
                        warningCollateralRatio4
                        liqCollateralRatio4
                        decimals
                    }
                }
            `,
            fetchPolicy: 'no-cache',
        });

        return data.data.defiConfiguration || {};
    }

    /**
     * @param {string} _ownerAddress
     * @param {string|array} [_symbol]
     * @return {Promise<DefiToken[]>}
     */
    async fetchTokens(_ownerAddress, _symbol) {
        const data = await this.apolloClient.query({
            query: gql`
                query DefiTokens($owner: Address!) {
                    defiTokens {
                        address
                        name
                        symbol
                        logoUrl
                        decimals
                        price
                        priceDecimals
                        isActive
                        canDeposit
                        canBorrow
                        canTrade
                        availableBalance(owner: $owner)
                        allowance(owner: $owner)
                    }
                }
            `,
            variables: {
                owner: _ownerAddress,
            },
            fetchPolicy: 'no-cache',
        });
        const defiTokens = data.data.defiTokens || [];
        let tokens = [];

        if (_symbol) {
            if (typeof _symbol === 'string') {
                tokens = defiTokens.find((_item) => _item.symbol === _symbol);
            } else if (_symbol.length) {
                tokens = defiTokens.filter((_item) => _symbol.indexOf(_item.symbol) > -1);
            }
        } else {
            tokens = defiTokens;
        }

        return tokens;
    }

    /**
     * @param {string} _ownerAddress
     * @return {Promise<DefiAccount>}
     */
    async fetchDefiAccount(_ownerAddress = '') {
        const data = await this.apolloClient.query({
            query: gql`
                query DefiAccount($owner: Address!) {
                    defiAccount(owner: $owner) {
                        address
                        collateral {
                            type
                            tokenAddress
                            balance
                            value
                            token {
                                address
                                symbol
                            }
                        }
                        collateralValue
                        collateralList
                        debt {
                            type
                            tokenAddress
                            balance
                            value
                            token {
                                address
                                symbol
                            }
                        }
                        debtValue
                        debtList
                    }
                }
            `,
            variables: {
                owner: _ownerAddress,
            },
            fetchPolicy: 'no-cache',
        });
        /** @type {DefiAccount} */
        const { defiAccount } = data.data;

        return defiAccount;
    }

    /**
     * @param {string} [_to]
     * @return {Promise<Number>}
     */
    async fetchFTMTokenPrice(_to = 'USD') {
        const data = await this.apolloClient.query({
            query: gql`
                query Price($to: String!) {
                    price(to: $to) {
                        price
                    }
                }
            `,
            variables: {
                to: _to,
            },
            fetchPolicy: 'no-cache',
        });

        if (!data.data.price) {
            return;
        }

        let tokenPrice = parseFloat(data.data.price.price);

        tokenPrice = parseInt(tokenPrice * 100000) / 100000;

        return tokenPrice;
    }
}
