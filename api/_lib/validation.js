'use strict';
const {HttpError}=require('./errors');
const ENTITIES=new Set(['listings','content_items','offers','campaigns','transactions','leads','claim_requests','form_submissions','tasks']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function entityName(value){if(!ENTITIES.has(value))throw new HttpError(404,'unknown_entity','Unknown entity.');return value}
function pageQuery(query={}){const limit=query.limit===undefined?50:Number(query.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'invalid_limit','Limit must be an integer from 1 to 100.');if(query.cursor!==undefined&&!UUID.test(query.cursor))throw new HttpError(400,'invalid_cursor','Cursor must be a UUID.');return {limit,cursor:query.cursor||null}}
function jsonBody(req){if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new HttpError(400,'invalid_body','A JSON object is required.');const text=JSON.stringify(req.body);if(Buffer.byteLength(text)>32768)throw new HttpError(413,'body_too_large','Request body is too large.');return req.body}
module.exports={ENTITIES,entityName,pageQuery,jsonBody};
