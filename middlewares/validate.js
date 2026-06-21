import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';

const formatZodError = (error) => {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join(', ');
};

const validatePart = (schema, value) => {
  if (!schema) return value;
  return schema.parse(value);
};

const validate = (schemas = {}) => {
  return (req, res, next) => {
    try {
      req.body = validatePart(schemas.body, req.body);
      req.params = validatePart(schemas.params, req.params);
      req.query = validatePart(schemas.query, req.query);
      next();
    } catch (error) {
      next(new ApiError(StatusCodes.BAD_REQUEST, formatZodError(error)));
    }
  };
};

export default validate;
