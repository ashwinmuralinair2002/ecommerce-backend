const asyncHandler = (fn) => {
  return async function wrappedAsyncHandler(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      throw error;
    }
  };
};

module.exports = asyncHandler;
