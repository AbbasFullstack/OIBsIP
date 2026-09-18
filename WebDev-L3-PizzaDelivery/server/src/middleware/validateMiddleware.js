import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

// Drop-in final link in every express-validator chain. Converts the collected
// errors into a single 400 so handlers never see an invalid body.
const validate = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(ApiError.badRequest('Validation failed', details));
};

export default validate;