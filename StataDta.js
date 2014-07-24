if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}
	
// adapted from http://stackoverflow.com/a/12617987
DataView.prototype.getUTF8 = function(offset, length) {
	var utf16 = new ArrayBuffer(length * 2),
		utf16View = new Uint16Array(utf16),
		next,
		i;
	for (i = 0; i < length; ++i) {
		next = this.getUint8(offset + i)
		if (next !== 0) {
			utf16View[i] = next;
		} else {
			break;
		}
	}
	return String.fromCharCode.apply(null, utf16View).slice(0,i);
};

DataView.prototype.getBlob = function(offset, length) {
	var ab = new ArrayBuffer(length),
		abView = new DataView(ab),
		i;
	for (i = 0; i < length; ++i) {
		abView.setInt8(i, this.getInt8(offset + i));
	}
	return new Blob([abView]);
};

StataDta = {
	// http://stackoverflow.com/a/5450113
	stringRepeat: function (pattern, count) {
		if (count < 1) return '';
		var result = '';
		while (count > 0) {
			if (count & 1) result += pattern;
			count >>= 1, pattern += pattern;
		}
		return result;
	},
	
	// http://stackoverflow.com/a/5055819
	parseFloatGeneral: function (str, radix) {
		var parts = str.split("."),
		    wh,
			fr;
		if ( parts.length > 1 ) {
			wh = parseInt(parts[0], radix);
			fr = parseInt(parts[1], radix) / Math.pow(radix, parts[1].length);
			return wh + fr;
		}
		return parseInt(parts[0], radix);
	},
	
	MissingValue: function (index) {
		if (!(this instanceof StataDta.MissingValue)) {
			return new StataDta.MissingValue(index);
		}
		var hexStr = ((index < 2) ? '0' : '') + ((index + 1) * 8).toString(16),
			zeroFill = StataDta.stringRepeat('0', 252),
			letters = "abcdefghijklmnopqrstuvwxyz",
			strRep = "." + letters.slice(index - 1, index);
		this.valueOf = StataDta.parseFloatGeneral('80' + hexStr + zeroFill, 16);
		this.toString = function () { return strRep; };
	},
	
	msgUnexpected: function (exp, got) {
		alert("Unexpected value in file.\nExpected " + exp + ", got " + got + ".");
	},

	makeDta115Obj: function (dtaView, asJSON) {
		var dtaObj = {},
			nvar,
			nobs,
			littleEndian,
			i,
			j,
			typlist,
			varlist,
			offset,
			data_type,
			data_len,
			chrdict,
			varname,
			charname,
			charstring,
			varvals,
			row,
			valueLabels,
			leastMissing,
			getMissing,
			getVarVal,
			getSrtlist,
			parseValueLabelTable,
			msgUnexpected = StataDta.msgUnexpected,
			MVS = StataDta.MISSINGVALUES;
		
		leastMissing = {
			251: 101,
			252: 32741,
			253: 2147483621, 
            254: StataDta.parseFloatGeneral('8' + StataDta.stringRepeat('0', 31), 16),
            255: StataDta.parseFloatGeneral('8' + StataDta.stringRepeat('0', 255), 16)  
		};
		
        getMissing = function (value, stType) {
			var index;
            switch (stType) {
			case 251:  // byte
                return MVS[value - 101];
            case 252:  // int
                return MVS[value - 32741];
            case 253:  // long
                return MVS[value - 2147483621];
            default:  // float or double
				index = parseInt('0x' + value.toString(16).slice(2,4)) / 8;
                return MVS[index];
            }
		};
		
		getVarVal = function (stType) {
			var value;
			if (stType <= 244) {
				value = dtaView.getUTF8(offset, stType);
				offset += stType;
				return value;
			}
			switch (stType) {
			case 251:
				value = dtaView.getInt8(offset);
				offset += 1
				break;
			case 252:
				value = dtaView.getInt16(offset, littleEndian);
				offset += 2
				break;
			case 253:
				value = dtaView.getInt32(offset, littleEndian);
				offset += 4
				break;
			case 254:
				value = dtaView.getFloat32(offset, littleEndian);
				offset += 4
				break;
			case 254:
				value = dtaView.getFloat64(offset, littleEndian);
				offset += 8
				break;
			default:
				return undefined; // file contains unexpected Stata type
			}
			return (typeof value === "undefined" || value < leastMissing[stType]) ? value : getMissing(value, stType);
		}
		
		getSrtlist = function () {
			var srtlist = [],
				i,
				j,
				index;
			for (i = 0; i < nvar; i++) {
				index = dtaView.getUint16(offset, littleEndian)
				offset += 2;
				if (index !== 0) {
					srtlist.push(index - 1);
				} else {
					break;
				}
			}
			for (j = i; j < nvar; j++) {
				srtlist.push(null);
				offset += 2;
			}
			return srtlist;
		}
		
		parseValueLabelTable = function () {
			var n,
				txtLen,
				off = [],
				val = [],
				txt = [],
				txtBlock,
				i,
				table;
			
			n = dtaView.getInt32(offset, littleEndian);
			offset += 4;
			txtLen = dtaView.getInt32(offset, littleEndian);
			offset += 4;
			
			for (i = 0; i < n; i++) {
				off.push(dtaView.getInt32(offset, littleEndian));
				offset += 4;
			}
			
			for (i = 0; i < n; i++) {
				val.push(dtaView.getInt32(offset, littleEndian));
				offset += 4;
			}
			
			// put (off, val) pairs in same order as txt
			sorter = [];
			for (i = 0; i < n; i++) {
				sorter.push([off[i], val[i]]);
			}
			sorter.sort();
			
			// read text and create table
			table = {};
			for (i = 0; i < n; i++) {
				start = sorter[i][0];
				size = (i < n - 1) ? sorter[i+1][0] - start - 1 : txtLen - start - 1;
				txt[i] = dtaView.getUTF8(offset + start, size);
				table[String(sorter[i][1])] = txt[i];
			}
			offset += txtLen;
			
			return table;
		}
	
		// header info
		offset = 0;
		dtaObj._dsFormat = dtaView.getInt8(0);
		offset += 1;
		littleEndian = (dtaView.getInt8(1) === 2);
		dtaObj._littleEndian = littleEndian;
		offset += 1;
		// skip filetype byte and one empty byte
		offset += 2;
		dtaObj._nvar = nvar = dtaView.getInt16(4, littleEndian);
		offset += 2;
		dtaObj._nobs = nobs = dtaView.getInt32(6, littleEndian);
		offset += 4;
		dtaObj._dataLabel = dtaView.getUTF8(offset, 81);
		offset += 81;
		dtaObj._timestamp = dtaView.getUTF8(offset, 18);
		offset += 18;
	
		// descriptors
		typlist = []
		for (i = 0; i < nvar; i++) {
			typlist.push(dtaView.getUint8(offset, 1));
			offset += 1;
		}
		dtaObj._typlist = typlist;
		
		varlist = []
		for (i = 0; i < nvar; i++) {
			varlist.push(dtaView.getUTF8(offset, 33));
			offset += 33;
		}
		dtaObj._varlist = varlist;
		
		dtaObj._srtlist = getSrtlist();
		
		dtaObj._fmtlist = []
		for (i = 0; i < nvar; i++) {
			dtaObj._fmtlist.push(dtaView.getUTF8(offset, 49));
			offset += 49;
		}
		
		dtaObj._lbllist = []
		for (i = 0; i < nvar; i++) {
			dtaObj._lbllist.push(dtaView.getUTF8(offset, 33));
			offset += 33;
		}
	
		// variable labels
		dtaObj._vlblist = []
		for (i = 0; i < nvar; i++) {
			dtaObj._vlblist.push(dtaView.getUTF8(offset, 81));
			offset += 81;
		}
		
		// expansion fields
		data_type = dtaView.getInt8(offset);
		offset += 1;
		data_len = dtaView.getInt32(offset, littleEndian);
		offset += 4;
		chrdict = {};
		while (!(data_type === 0 && data_len === 0)) {
			varname = dtaView.getUTF8(offset, 33);
			offset += 33;
			charname = dtaView.getUTF8(offset, 33);
			offset += 33;
			charstring = dtaView.getUTF8(offset, data_len - 66);
			offset += data_len - 66;
			chrdict[varname] = chrdict[varname] || {};
			chrdict[varname][charname] = charstring;
			data_type = dtaView.getInt8(offset);
			offset += 1;
			data_len = dtaView.getInt8(offset, littleEndian);
			offset += 4;
		}
		dtaObj._chrdict = chrdict;
		
		// data
		varvals = [];
		if (asJSON) {
			for (i = 0; i < nobs; i++) {
				row = {};
				for (j = 0; j < nvar; j++) {
					row[varlist[j]] = getVarVal(typlist[j]);
				}
				varvals.push(row);
			}
		} else {
			for (i = 0; i < nobs; i++) {
				row = [];
				for (j = 0; j < nvar; j++) {
					row.push(getVarVal(typlist[j]));
				}
				varvals.push(row);
			}
		}
		dtaObj._varvals = varvals;
		
		// value labels
		valueLabels = {};
		while (offset <= dtaView.byteLength - 40) {
			try {
				offset += 4;	// table length
				labname = dtaView.getUTF8(offset, 33)
				offset += 33;
				offset += 3;	// padding
				valueLabels[labname] = parseValueLabelTable();
			}
			catch (e) {
				break;
			}
		}
		dtaObj._vallabs = valueLabels;
		
		return dtaObj;
	},
	
	makeDta117Obj: function (dtaView, asJSON) {
		var dtaObj = {},
			nvar,
			nobs,
			littleEndian,
			textLen,
			i,
			j,
			typlist,
			varlist,
			offset,
			data_type,
			data_len,
			chrdict,
			varname,
			charname,
			charstring,
			varvals,
			row,
			strL,
			strls,
			v,
			o,
			t,
			valueLabels,
			leastMissing,
			getMissing,
			getVarVal,
			getSrtlist,
			parseValueLabelTable,
			MVS = StataDta.MISSINGVALUES;
		
		leastMissing = {
			65530: 101,
			65529: 32741,
			65528: 2147483621, 
            65527: StataDta.parseFloatGeneral('8' + StataDta.stringRepeat('0', 31), 16),
            65526: StataDta.parseFloatGeneral('8' + StataDta.stringRepeat('0', 255), 16)
		};
		
        getMissing = function (value, stType) {
			var index;
            switch (stType) {
			case 65530:  // byte
                return MVS[value - 101];
            case 65529:  // int
                return MVS[value - 32741];
            case 65528:  // long
                return MVS[value - 2147483621];
            default:  // float or double
				index = parseInt('0x' + value.toString(16).slice(2,4)) / 8;
                return MVS[index];
            }
		};
		
		getVarVal = function (stType) {
			var value;
			if (stType <= 2045) {
				value = dtaView.getUTF8(offset, stType);
				offset += stType;
				return value;
			}
			if (stType === 32768) {
				value = [
					dtaView.getUint32(offset, littleEndian),
					dtaView.getUint32(offset + 4, littleEndian)
				];
				offset += 8;
				return value;
			}
			switch (stType) {
			case 65530:
				value = dtaView.getInt8(offset);
				offset += 1
				break;
			case 65529:
				value = dtaView.getInt16(offset, littleEndian);
				offset += 2
				break;
			case 65528:
				value = dtaView.getInt32(offset, littleEndian);
				offset += 4
				break;
			case 65527:
				value = dtaView.getFloat32(offset, littleEndian);
				offset += 4
				break;
			case 65526:
				value = dtaView.getFloat64(offset, littleEndian);
				offset += 8
				break;
			default:
				return undefined; // file contains unexpected data type
			}
			return (typeof value === "undefined" || value < leastMissing[stType]) ? value : getMissing(value, stType);
		}
		
		getSrtlist = function () {
			var srtlist = [],
				i,
				j,
				index;
			for (i = 0; i < nvar; i++) {
				index = dtaView.getUint16(offset, littleEndian)
				offset += 2;
				if (index !== 0) {
					srtlist.push(index - 1);
				} else {
					break;
				}
			}
			for (j = i; j < nvar; j++) {
				srtlist.push(null);
				offset += 2;
			}
			return srtlist;
		}
		
		parseValueLabelTable = function () {
			var n,
				txtLen,
				off = [],
				val = [],
				txt = [],
				txtBlock,
				i,
				table;
			
			n = dtaView.getInt32(offset, littleEndian);
			offset += 4;
			txtLen = dtaView.getInt32(offset, littleEndian);
			offset += 4;
			
			for (i = 0; i < n; i++) {
				off.push(dtaView.getInt32(offset, littleEndian));
				offset += 4;
			}
			
			for (i = 0; i < n; i++) {
				val.push(dtaView.getInt32(offset, littleEndian));
				offset += 4;
			}
			
			// put (off, val) pairs in same order as txt
			sorter = [];
			for (i = 0; i < n; i++) {
				sorter.push([off[i], val[i]]);
			}
			sorter.sort();
			
			// read text and create table
			table = {};
			for (i = 0; i < n; i++) {
				start = sorter[i][0];
				size = (i < n - 1) ? sorter[i+1][0] - start - 1 : txtLen - start - 1;
				txt[i] = dtaView.getUTF8(offset + start, size);
				table[String(sorter[i][1])] = txt[i];
			}
			offset += txtLen;
			
			return table;
		}
		
		// opening tag
		offset = 0;
		if (dtaView.getUTF8(offset, 11) != "<stata_dta>") {
			msgUnexpected("<stata_dta>", dtaView.getUTF8(offset, 11));
			return;
		}
		offset += 11;
	
		// header info
		if (dtaView.getUTF8(offset, 8) != "<header>") {
			msgUnexpected("<header>", dtaView.getUTF8(offset, 8));
			return;
		}
		offset += 8;
		
		if (dtaView.getUTF8(offset, 9) != "<release>") {
			msgUnexpected("<release>", dtaView.getUTF8(offset, 9));
			return;
		}
		offset += 9;
		dtaObj._dsFormat = parseInt(dtaView.getUTF8(offset, 3));
		offset += 3;
		if (dtaView.getUTF8(offset, 10) != "</release>") {
			msgUnexpected("</release>", dtaView.getUTF8(offset, 10));
			return;
		}
		offset += 10;
		
		if (dtaView.getUTF8(offset, 11) != "<byteorder>") {
			msgUnexpected("<byteorder>", dtaView.getUTF8(offset, 11));
			return;
		}
		offset += 11;
		littleEndian = (dtaView.getUTF8(offset, 3) === "LSF");
		dtaObj._littleEndian = littleEndian;
		offset += 3;
		if (dtaView.getUTF8(offset, 12) != "</byteorder>") {
			msgUnexpected("</byteorder>", dtaView.getUTF8(offset, 12));
			return;
		}
		offset += 12;
		
		if (dtaView.getUTF8(offset, 3) != "<K>") {
			msgUnexpected("<K>", dtaView.getUTF8(offset, 3));
			return;
		}
		offset += 3;
		nvar = dtaView.getUint16(offset, littleEndian);
		dtaObj._nvar = nvar;
		offset += 2;
		if (dtaView.getUTF8(offset, 4) != "</K>") {
			msgUnexpected("</K>", dtaView.getUTF8(offset, 4));
			return;
		}
		offset += 4;
		
		if (dtaView.getUTF8(offset, 3) != "<N>") {
			msgUnexpected("<N>", dtaView.getUTF8(offset, 3));
			return;
		}
		offset += 3;
		nobs = dtaView.getUint32(offset, littleEndian);
		dtaObj._nobs = nobs;
		offset += 4;
		if (dtaView.getUTF8(offset, 4) != "</N>") {
			msgUnexpected("</N>", dtaView.getUTF8(offset, 4));
			return;
		}
		offset += 4;
		
		if (dtaView.getUTF8(offset, 7) != "<label>") {
			msgUnexpected("<label>", dtaView.getUTF8(offset, 7));
			return;
		}
		offset += 7;
		textLen = dtaView.getUint8(offset);
		offset += 1;
		dtaObj._dataLabel = dtaView.getUTF8(offset, textLen);
		offset += textLen;
		if (dtaView.getUTF8(offset, 8) != "</label>") {
			msgUnexpected("</label>", dtaView.getUTF8(offset, 8));
			return;
		}
		offset += 8;
		
		if (dtaView.getUTF8(offset, 11) != "<timestamp>") {
			msgUnexpected("<timestamp>", dtaView.getUTF8(offset, 11));
			return;
		}
		offset += 11;
		textLen = dtaView.getUint8(offset);
		offset += 1;
		dtaObj._timestamp = dtaView.getUTF8(offset, textLen);
		offset += textLen;
		next = dtaView.getUint8(offset);
		offset += 1;
		if (!(next == 0 && dtaView.getUTF8(offset, 12) == "</timestamp>") &&
			!(next == 60 && dtaView.getUTF8(offset, 11) == "/timestamp>")) {
			msgUnexpected("</timestamp>", dtaView.getUTF8(offset, 12));
			return;
		} else {
			if (next == 0) offset += 12;
			else offset += 11;
		}
		
		if (dtaView.getUTF8(offset, 9) != "</header>") {
			msgUnexpected("</header>", dtaView.getUTF8(offset, 9));
			return;
		}
		offset += 9;
		
		// Skip the map. Requires 64-bit integers. 
		// JS represents all numbers as 64-bit float.
		
		// map
		if (dtaView.getUTF8(offset, 5) != "<map>") {
			msgUnexpected("<map>", dtaView.getUTF8(offset, 5));
			return;
		}
		offset += 5;
		offset += 8 * 14;	// 14 locations, each an unsigned 64-bit integer
		if (dtaView.getUTF8(offset, 6) != "</map>") {
			msgUnexpected("</map>", dtaView.getUTF8(offset, 6));
			return;
		}
		offset += 6;
		
		// variable types
		if (dtaView.getUTF8(offset, 16) != "<variable_types>") {
			msgUnexpected("<variable_types>", dtaView.getUTF8(offset, 16));
			return;
		}
		offset += 16;
		typlist = [];
		for (i = 0; i < nvar; i++) {
			typlist.push(dtaView.getUint16(offset, littleEndian));
			offset += 2;
		}
		dtaObj._typlist = typlist;
		if (dtaView.getUTF8(offset, 17) != "</variable_types>") {
			msgUnexpected("</variable_types>", dtaView.getUTF8(offset, 17));
			return;
		}
		offset += 17;
		
		// variable names
		if (dtaView.getUTF8(offset, 10) != "<varnames>") {
			msgUnexpected("<varnames>", dtaView.getUTF8(offset, 10));
			return;
		}
		offset += 10;
		varlist = [];
		for (i = 0; i < nvar; i++) {
			varlist.push(dtaView.getUTF8(offset, 33));
			offset += 33;
		}
		dtaObj._varlist = varlist;
		if (dtaView.getUTF8(offset, 11) != "</varnames>") {
			msgUnexpected("</varnames>", dtaView.getUTF8(offset, 11));
			return;
		}
		offset += 11;
		
		// sortlist
		if (dtaView.getUTF8(offset, 10) != "<sortlist>") {
			msgUnexpected("<sortlist>", dtaView.getUTF8(offset, 10));
			return;
		}
		offset += 10;
		dtaObj._srtlist = getSrtlist();
		if (dtaView.getUTF8(offset, 11) != "</sortlist>") {
			msgUnexpected("</sortlist>", dtaView.getUTF8(offset, 11));
			return;
		}
		offset += 11;
		
		// formats
		if (dtaView.getUTF8(offset, 9) != "<formats>") {
			msgUnexpected("<formats>", dtaView.getUTF8(offset, 9));
			return;
		}
		offset += 9;
		dtaObj._fmtlist = [];
		for (i = 0; i < nvar; i++) {
			dtaObj._fmtlist.push(dtaView.getUTF8(offset, 49));
			offset += 49;
		}
		if (dtaView.getUTF8(offset, 10) != "</formats>") {
			msgUnexpected("</formats>", dtaView.getUTF8(offset, 10));
			return;
		}
		offset += 10;
		
		// value label names
		if (dtaView.getUTF8(offset, 19) != "<value_label_names>") {
			msgUnexpected("<value_label_names>", dtaView.getUTF8(offset, 19));
			return;
		}
		offset += 19;
		dtaObj._lbllist = [];
		for (i = 0; i < nvar; i++) {
			dtaObj._lbllist.push(dtaView.getUTF8(offset, 33));
			offset += 33;
		}
		if (dtaView.getUTF8(offset, 20) != "</value_label_names>") {
			msgUnexpected("</value_label_names>", dtaView.getUTF8(offset, 20));
			return;
		}
		offset += 20;
		
		// variable labels
		if (dtaView.getUTF8(offset, 17) != "<variable_labels>") {
			msgUnexpected("<variable_labels>", dtaView.getUTF8(offset, 17));
			return;
		}
		offset += 17;
		dtaObj._vbllist = [];
		for (i = 0; i < nvar; i++) {
			dtaObj._vbllist.push(dtaView.getUTF8(offset, 81));
			offset += 81;
		}
		if (dtaView.getUTF8(offset, 18) != "</variable_labels>") {
			msgUnexpected("</variable_labels>", dtaView.getUTF8(offset, 18));
			return;
		}
		offset += 18;
		
		// characteristics
		if (dtaView.getUTF8(offset, 17) != "<characteristics>") {
			msgUnexpected(" <characteristics>", dtaView.getUTF8(offset, 17));
			return;
		}
		offset += 17;
		chrdict = {};
		next = dtaView.getUTF8(offset, 4);
		offset += 4;
		while (next === "<ch>") {
			textLen = dtaView.getUint32(offset, littleEndian);
			offset += 4;
			varname = dtaView.getUTF8(offset, 33);
			offset += 33;
			charname = dtaView.getUTF8(offset, 33);
			offset += 33;
			charstring = dtaView.getUTF8(offset, textLen - 66);
			offset += textLen - 66;
			chrdict[varname] = chrdict[varname] || {};
			chrdict[varname][charname] = charstring;
			if (dtaView.getUTF8(offset, 5) != "</ch>") {
				msgUnexpected(" </ch>", dtaView.getUTF8(offset, 5));
				return;
			}
			offset += 5;
			next = dtaView.getUTF8(offset, 4);
			offset += 4;
		}
		dtaObj._chrdict = chrdict;
		if (next !== "</ch" || dtaView.getUTF8(offset, 14) != "aracteristics>") {
			msgUnexpected("</characteristics>", next + dtaView.getUTF8(offset, 14));
			return;
		}
		offset += 14;
		
		// data
		if (dtaView.getUTF8(offset, 6) != "<data>") {
			msgUnexpected("<data>", dtaView.getUTF8(offset, 6));
			return;
		}
		offset += 6;
		varvals = [];
		if (asJSON) {
			for (i = 0; i < nobs; i++) {
				row = {};
				for (j = 0; j < nvar; j++) {
					row[varlist[j]] = getVarVal(typlist[j]);
				}
				varvals.push(row);
			}
		} else {
			for (i = 0; i < nobs; i++) {
				row = [];
				for (j = 0; j < nvar; j++) {
					row.push(getVarVal(typlist[j]));
				}
				varvals.push(row);
			}
		}
		dtaObj._varvals = varvals;
		if (dtaView.getUTF8(offset, 7) != "</data>") {
			msgUnexpected("</data>", dtaView.getUTF8(offset, 7));
			return;
		}
		offset += 7;
		
		// strLs
		if (dtaView.getUTF8(offset, 7) != "<strls>") {
			msgUnexpected("<strls>", dtaView.getUTF8(offset, 7));
			return;
		}
		offset += 7;
		strls = {0: {0: ""}};
		next = dtaView.getUTF8(offset, 3);
		offset += 3;
		while (next === "GSO") {
			v = dtaView.getUint32(offset, littleEndian);
			offset += 4;
			o = dtaView.getUint32(offset, littleEndian);
			offset += 4;
			t = dtaView.getUint8(offset);
			offset += 1;
			textLen = dtaView.getUint32(offset, littleEndian);
			offset += 4;
			strls[v] = strls[v] || {};
			if (t === 130) {
				strls[v][o] = dtaView.getUTF8(offset, textLen);
			} else {
				strls[v][o] = dtaView.getBlob(offset, textLen);
			}
			offset += textLen;
			next = dtaView.getUTF8(offset, 3);
			offset += 3;
		}
		if (next !== "</s" || dtaView.getUTF8(offset, 5) != "trls>") {
			msgUnexpected("</strls>", next + dtaView.getUTF8(offset, 5));
			return;
		}
		offset += 5;
		
		// put strls in data
		if (asJSON) {
			for (j = 0; j < nvar; j++) {
				if (typlist[j] !== 32768) continue;
				varname = varlist[j]
				for (i = 0; i < nobs; i++) {
					row = varvals[i];
					v = row[varname][0];
					o = row[varname][1];
					row[varname] = strls[v][o];
				}
			}
		} else {
			for (j = 0; j < nvar; j++) {
				if (typlist[j] !== 32768) continue;
				for (i = 0; i < nobs; i++) {
					row = varvals[i];
					v = row[j][0];
					o = row[j][1];
					row[j] = strls[v][o];
				}
			}
		}
		
		// value labels
		if (dtaView.getUTF8(offset, 14) != "<value_labels>") {
			msgUnexpected(" <value_labels>", dtaView.getUTF8(offset, 14));
			return;
		}
		offset += 14;
		valueLabels = {};
		next = dtaView.getUTF8(offset, 5);
		offset += 5;
		while (next === "<lbl>") {
			offset += 4;	// table length
			labname = dtaView.getUTF8(offset, 33)
			offset += 33;
			offset += 3;	// padding
			valueLabels[labname] = parseValueLabelTable();
			if (dtaView.getUTF8(offset, 6) != "</lbl>") {
				msgUnexpected("</lbl>", dtaView.getUTF8(offset, 6));
				return;
			}
			offset += 6;
			next = dtaView.getUTF8(offset, 5);
			offset += 5;
		}
		dtaObj._vallabs = valueLabels;
		if (next != "</val" || dtaView.getUTF8(offset, 10) != "ue_labels>") {
			msgUnexpected("</value_labels>", next + dtaView.getUTF8(offset, 10));
			return;
		}
		offset += 10;
		
		// end tag
		if (dtaView.getUTF8(offset, 12) != "</stata_dta>") {
			msgUnexpected("</stata_dta>", dtaView.getUTF8(offset, 12));
			return;
		}
		
		return dtaObj;
	},
	
	open: function (dtaView, asJSON) {
		var firstByte = dtaView.getInt8(0);
		if (firstByte === 114 || firstByte === 115) {
			return StataDta.makeDta115Obj(dtaView, asJSON);
		} else if (dtaView.getUTF8(0, 11) === "<stata_dta>") {
			return StataDta.makeDta117Obj(dtaView, asJSON);
		} else {
			alert("File type does not seem to be a supported.\nOnly dta formats 117, 115, and 114 are supported.");
		}
	}
};

StataDta.MISSINGVALUES = (function () {
	var i,
		mvs = [],
		MissingValue = StataDta.MissingValue;
	
	for (i = 0; i < 27; i++) {
		mvs.push(new MissingValue(i));
	}
	
	return mvs;
}());
	
StataDta.MISSING = StataDta.MISSINGVALUES[0];
