var Game;

Game = (function() {

  function Game() {
    this.fetchUserInfo = __bind(this.fetchUserInfo, this);
    this.processInfo = __bind(this.processInfo, this);
    this.requestCards = __bind(this.requestCards, this);
    this.load = __bind(this.load, this);
    this.init = __bind(this.init, this);
    this.begin = __bind(this.begin, this);
    this.update = __bind(this.update, this);
    this.draw = __bind(this.draw, this);
    this.loop = __bind(this.loop, this);
    this.mousedown = __bind(this.mousedown, this);
    this.mousemove = __bind(this.mousemove, this);
    this.mouseup = __bind(this.mouseup, this);

    this.id = game_id;

    this.events = _.extend({}, Backbone.Events);
    this.events.on('next-turn', this.requestCards, this);
    this.events.on('next-turn', this.setLastMove, this);

    this.fetchUserInfo();
  };

  Game.prototype.template = function(name, context) {
    return JST['app/templates/' + name](context);
  };

  Game.prototype.processInfo = function(info) {
    this.socketURL = info.socketURL;
    this.user_id = info.id;
    this.events.trigger('connect-info', info);
  };

  Game.prototype.fetchUserInfo = function() {
    $.ajax({
      url: '/games/user_info.json',
      success: this.processInfo
    });
  };

  Game.prototype.token = function() {
    if (game.user) {
      return game.user.get('token');
    }
  };

  Game.prototype.requestCards = function() {
    console.log('requesting cards...');
    if (this.token()) {
      this.events.trigger('request-cards');
    } else {
      console.log('delaying ...');
      setTimeout(this.requestCards, 2 * 1000);
    }
  };

  Game.prototype.isMyTurn = function() {
    return this.model.get('turn_id') == this.user_id;
  };

  Game.prototype.boardPositionIsUp = function() {
    return this.user.get('position') == 0;
  };

  Game.prototype.load = function() {
    this.events.trigger('load', {})
    this.canvasBg = document.getElementById("canvasBg");
    this.ctxBg = canvasBg.getContext("2d");
    this.canvasEntities = document.getElementById("canvasEntities");
    this.ctxEntities = canvasEntities.getContext("2d");
    this.canvasWidth = canvasBg.width;
    this.canvasHeight = canvasBg.height;
    this.isPlaying = false;
    this.mousePreviousCoordinates = null;
    this.cardDragging = null;
    this.imgSprite = new Image();
    this.imgSprite.src = "/assets/sprite.png";
    this.imgSprite.addEventListener("load", this.init, false);
  };


  Game.prototype.init = function() {
    this.canvasEntities.addEventListener('mousedown', this.mousedown, false);
    this.canvasEntities.addEventListener('mousemove', this.mousemove, false);
    this.canvasEntities.addEventListener('mouseup',   this.mouseup, false);
    this.begin();
  };

  Game.prototype.begin = function() {
    this.ctxBg.drawImage(this.imgSprite,
        0, 0, this.canvasWidth, this.canvasHeight,
        0, 0, this.canvasWidth, this.canvasHeight);
    this.requestCards();
    this.isPlaying = true;
    requestAnimationFrame(this.loop);
  };

  Game.prototype.update = function() {
    this.ctxEntities.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    cardModule.cardsView.update();
    stoneModule.stonesView.update();
  };

  Game.prototype.draw = function() {
    cardModule.cardsView.render();
    stoneModule.stonesView.render();
  };

  Game.prototype.loop = function() {
    if (this.isPlaying) {
      this.update();
      this.draw();
      requestAnimationFrame(this.loop);
    }
  };

  Game.prototype.mousedown = function(e){
    mouse = __calculate_coordinates_on_canvas(this.canvasEntities, e);

    selected_stone = _.find(stoneModule.stones.models, function(stone){
      return stone.view.drawX < mouse.x && mouse.x < stone.view.drawX + stone.view.width &&
          stone.view.drawY < mouse.y && mouse.y < stone.view.drawY + stone.view.height;
    });

    if (selected_stone && this.isMyTurn()) {
      if (selected_stone.get('user_id')) {
        selected_stone.set('user_id', null);
      } else {
        selected_stone.set('user_id', game.user_id);
      }
    }

    selected_card = _.find(cardModule.cards.models, function(card){
      return card.view.drawX < mouse.x && mouse.x < card.view.drawX + card.view.width &&
          card.view.drawY < mouse.y && mouse.y < card.view.drawY + card.view.height;
    });

    if (selected_card) {
      this.cardDragging = selected_card.view;
      this.mousePreviousCoordinates = mouse;
      this.cardDragging.isDragging = true;
      this.targets = this.availableTargets();
    }
  };

  Game.prototype.mousemove = function(e){
    if (this.cardDragging) {
      mouse = __calculate_coordinates_on_canvas(this.canvasEntities, e);
      _x = mouse.x - this.mousePreviousCoordinates.x;
      _y = mouse.y - this.mousePreviousCoordinates.y;
      this.cardDragging.drawX += _x;
      this.cardDragging.drawY += _y;
      this.mousePreviousCoordinates = mouse;
    }
  };

  Game.prototype.mouseup = function(e){
    if (this.cardDragging) {
      mouse = __calculate_coordinates_on_canvas(this.canvasEntities, e);

      selected_target = _.find(this.targets, function(target_index){
        var row = target_index % 6;
        var col = Math.floor(target_index / 6);
        var target_x = col * 90 + 20;
        var target_y = row * 60 + 92 + Math.floor(row/3) * 60;
        return  target_x < mouse.x && mouse.x < target_x + 50 &&
                target_y < mouse.y && mouse.y < target_y + 56;
      });

      if(selected_target != undefined) {
        this.cardDragging.model.set('position_on_board', selected_target);
      }

      this.cardDragging.isDragging = false;
      this.cardDragging = null;
      this.mousePreviousCoordinates = null;
    }
  };

  Game.prototype.availableTargets = function() {
    taken_positions = _.map(cardModule.cards.models, function(card) {
      return card.get('position_on_board');
    });
    unclaimed_positions = _.map(stoneModule.stones.unclaimed(), function(stone) {
      return _.range(stone.get('position') * 6, (stone.get('position') + 1) * 6);
    });

    available_positions = _.difference(_.flatten(unclaimed_positions), taken_positions);
    position_in_groups = _.groupBy(available_positions, function(position) {
      return Math.floor((position % 6) / 3);
    });
    return this.boardPositionIsUp() ? position_in_groups[0] : position_in_groups[1];
  };

  Game.prototype.setLastMove = function(last_move) {
    this.lastCardMovedId = last_move.card_id;
  };


 return Game;

})();

this.game = new Game();

