#StataDtaJS

StataDtaJS is a JavaScript library with a single purpose: read a Stata dataset file from disk and create a JavaScript object containing all of the file's information.

`StataDta.js` works with dta versions 114, 115, and 117 (the main versions used with Stata 11, 12, and 13), and, in particular, can read `strL` data in version 117.


`StataDta.js` uses JavaScript's `DataView` to read the dataset, and so can be used with any modern browser that supports `DataView`. It's likely that this library will work with a "polyfill" like [jDataView](https://github.com/jDataView/jDataView), but this has not been verified.


##Usage

Use the function `StataDta.open` to open a dta file. The function takes two arguments and returns an object. The first argument should be a `DataView` object, the second a boolean determining whether each row should be input as a JSON object or an array. 


##Example

The included `example.html` is a simple example that reads a dta file into the global variable `dta` which can then be inspected from a browser console. Here is example input and output from the Chrome browser after loading the `auto.dta` file that comes with Stata13:

    > dta
      Object {_dsFormat: 117, _littleEndian: true, _nvar: 12, _nobs: 74, _dataLabel: "1978 Automobile Data"…}
    > dta._varlist
      ["make", "price", "mpg", "rep78", "headroom", "trunk", "weight", "length", "turn", "displacement", "gear_ratio", "foreign"]
    > dta._varvals[0]
      Object {make: "AMC Concord", price: 4099, mpg: 22, rep78: 3, headroom: 2.5…}
    > dta._vallabs
      Object {origin: Object}
    > dta._vallabs['origin']
      Object {0: "Domestic", 1: "Foreign"}


##Side effects:

`StataDta.js` adds 

- the function `startsWith` to the `String` prototype if it does not already exist
- the function `getUTF8` to the `DataView` prototype
- the function `getBlob` to the `DataView` prototype

##Author
James Fiedler

email: jrfiedler at gmail dot com