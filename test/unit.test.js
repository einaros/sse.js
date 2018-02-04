const assert = require('../lib/utils/assert');

describe('Unit tests', () => {
  
  describe('lib/assert', () => {
    
    it('instanceOf', () => {
      try {
        assert.instanceOf({}, function () {
        });
      } catch (e) {
        return;
      }
      throw new Error('expected assertion to fail');
    });
    
    it('isFunction', () => {
      try {
        assert.isFunction({});
      } catch (e) {
        assert.isFunction(() => null);
        assert.isFunction(function () {
        });
        return;
      }
      throw new Error('expected assertion to fail');
    });
    
    it('isObject', () => {
      try {
        assert.isObject(3);
      } catch (e) {
        assert.isObject({});
        return;
      }
      throw new Error('expected assertion to fail');
    });
    
  });
  
});