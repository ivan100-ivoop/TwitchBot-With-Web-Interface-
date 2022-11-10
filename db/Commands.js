const mongoose = require("mongoose");

module.exports = mongoose.model("commands", new mongoose.Schema({
    id: { type: String, default: null },
    created_at: {type: Number, default: new Date()},
	name: {type: String, default: null},
	response: {type: String, default: null},
	access: {type: String, default: null}
}));