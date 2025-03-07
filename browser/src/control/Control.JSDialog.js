/* -*- js-indent-level: 8 -*- */
/*
 * L.Control.JSDialog
 */

/* global Hammer app */
L.Control.JSDialog = L.Control.extend({
	options: {
		snackbarTimeout: 10000
	},
	dialogs: {},
	draggingObject: null,

	onAdd: function (map) {
		this.map = map;

		this.map.on('jsdialog', this.onJSDialog, this);
		this.map.on('jsdialogupdate', this.onJSUpdate, this);
		this.map.on('jsdialogaction', this.onJSAction, this);
	},

	onRemove: function() {
		this.map.off('jsdialog', this.onJSDialog, this);
		this.map.off('jsdialogupdate', this.onJSUpdate, this);
		this.map.off('jsdialogaction', this.onJSAction, this);
	},

	hasDialogOpened: function() {
		return Object.keys(this.dialogs).length > 0;
	},

	clearDialog: function(id) {
		var builder = this.dialogs[id].builder;

		L.DomUtil.remove(this.dialogs[id].container);
		delete this.dialogs[id];

		return builder;
	},

	close: function(id, sendCloseEvent) {
		if (id && this.dialogs[id]) {
			if (this.dialogs[id].isPopup)
				this.closePopover(id, sendCloseEvent);
			else
				this.closeDialog(id, sendCloseEvent);
		}
	},

	closeDialog: function(id, sendCloseEvent) {
		if (!id || !this.dialogs[id]) {
			console.warn('missing dialog data');
			return;
		}

		var builder = this.clearDialog(id);
		if (sendCloseEvent !== false)
			builder.callback('dialog', 'close', {id: '__DIALOG__'}, null, builder);
	},

	// sendCloseEvent means that we only send a command to the server
	// we want to kill HTML popup when we receive feedback from the server
	closePopover: function(id, sendCloseEvent) {
		if (!id || !this.dialogs[id]) {
			console.warn('missing popover data');
			return;
		}

		if (!sendCloseEvent)
			L.DomUtil.remove(this.dialogs[id].overlay);

		var clickToClose = this.dialogs[id].clickToClose;
		var builder = this.dialogs[id].builder;

		if (sendCloseEvent) {
			if (clickToClose && L.DomUtil.hasClass(clickToClose, 'menubutton'))
				clickToClose.click();
			else
				builder.callback('popover', 'close', {id: '__POPOVER__'}, null, builder);
		}
		else
			this.clearDialog(id);
	},

	setTabs: function(tabs, builder) {
		var dialog = this.dialogs[builder.windowId.toString()];
		if (dialog) {
			var tabsContainer = dialog.tabs;

			while (tabsContainer.firstChild)
				tabsContainer.removeChild(tabsContainer.firstChild);

			tabsContainer.appendChild(tabs);
		}
	},

	selectedTab: function() {
		// nothing to do here
	},

	_getDefaultButtonId: function(widgets) {
		for (var i in widgets) {
			if (widgets[i].type === 'pushbutton' || widgets[i].type === 'okbutton') {
				if (widgets[i].has_default === true)
					return widgets[i].id;
			}

			if (widgets[i].children) {
				var found = this._getDefaultButtonId(widgets[i].children);
				if (found)
					return found;
			}
		}

		return null;
	},

	onJSDialog: function(e) {
		var that = this;
		var posX = 0;
		var posY = 0;
		var data = e.data;
		var callback = e.callback;
		var isSnackbar = data.type === 'snackbar';
		var isModalPopup = data.type === 'modalpopup' || isSnackbar;
		var focusWidgetId = data.init_focus_id;

		if (data.action === 'fadeout')
		{
			if (data.id && this.dialogs[data.id]) {
				var container = this.dialogs[data.id].container;
				L.DomUtil.addClass(container, 'fadeout');
				container.onanimationend = function() { that.close(data.id); };
				// be sure it will be removed
				setTimeout(function() { that.close(data.id); }, 700);
			}
			return;
		}
		else if (data.action === 'close')
		{
			this.close(data.id, false);
			return;
		}

		var toRemove = null;
		if (this.dialogs[data.id]) {
			posX = this.dialogs[data.id].startX;
			posY = this.dialogs[data.id].startY;
			toRemove = this.dialogs[data.id].container;
		}

		var isDocumentAreaPopup = data.popupParent === '_POPOVER_'
			&& data.posx !== undefined && data.posy !== undefined;
		var isCalc = this.map._docLayer ? (this.map._docLayer._docType === 'spreadsheet') : false;
		var isAutofilter = isDocumentAreaPopup && isCalc;

		var containerParent = isDocumentAreaPopup ?
			document.getElementById('document-container') : document.body;

		if (isAutofilter)
		{
			// this is autofilter popup

			// RTL mode: only difference is when file is RTL not UI
			// var isViewRTL = document.documentElement.dir === 'rtl';
			var isSpreadsheetRTL = this.map._docLayer.isCalcRTL();

			var scale = this.map.zoomToFactor(this.map.getZoom());
			var origin = this.map.getPixelOrigin();
			var panePos = this.map._getMapPanePos();

			var offsetX = isSpreadsheetRTL ? 0 : app.sectionContainer.getSectionWithName(L.CSections.RowHeader.name).size[0];
			var offsetY = app.sectionContainer.getSectionWithName(L.CSections.ColumnHeader.name).size[1];

			var left = parseInt(data.posx) * scale;
			var top = parseInt(data.posy) * scale;

			if (left < 0)
				left = -1 * left;

			var splitPanesContext = this.map.getSplitPanesContext();
			var splitPos = new L.Point(0, 0);

			if (splitPanesContext)
				splitPos = splitPanesContext.getSplitPos();

			var newLeft = left + panePos.x - origin.x;
			if (left >= splitPos.x && newLeft >= 0)
				left = newLeft;

			var newTop = top + panePos.y - origin.y;
			if (top >= splitPos.y && newTop >= 0)
				top = newTop;

			if (isSpreadsheetRTL)
				left = this.map._size.x - left;

			posX = left + offsetX;
			posY = top + offsetY;
		}

		// it has to be form to handle default button
		container = L.DomUtil.create('form', 'jsdialog-container ui-dialog ui-widget-content lokdialog_container', containerParent);
		container.id = data.id;
		container.style.visibility = 'hidden';
		if (data.collapsed && (data.collapsed === 'true' || data.collapsed === true))
			L.DomUtil.addClass(container, 'collapsed');
		// prevent from reloading
		container.addEventListener('submit', function (event) { event.preventDefault(); });

		var defaultButtonId = this._getDefaultButtonId(data.children);

		// it has to be first button in the form
		var defaultButton = L.DomUtil.createWithId('button', 'default-button', container);
		defaultButton.style.display = 'none';
		defaultButton.onclick = function() {
			if (defaultButtonId) {
				var button = container.querySelector('#' + defaultButtonId);
				if (button)
					button.click();
			}
		};

		if (!isModalPopup) {
			var titlebar = L.DomUtil.create('div', 'ui-dialog-titlebar ui-corner-all ui-widget-header ui-helper-clearfix', container);
			var title = L.DomUtil.create('span', 'ui-dialog-title', titlebar);
			title.innerText = data.title;
			var button = L.DomUtil.create('button', 'ui-button ui-corner-all ui-widget ui-button-icon-only ui-dialog-titlebar-close', titlebar);
			L.DomUtil.create('span', 'ui-button-icon ui-icon ui-icon-closethick', button);
		} else {
			L.DomUtil.addClass(container, 'modalpopup');
			if (isSnackbar)
				L.DomUtil.addClass(container, 'snackbar');
		}

		var tabs = L.DomUtil.create('div', 'jsdialog-tabs', container);
		var content = L.DomUtil.create('div', 'lokdialog ui-dialog-content ui-widget-content', container);

		// required to exist before builder was launched (for setTabs)
		this.dialogs[data.id] = {
			tabs: tabs
		};

		var builder = new L.control.jsDialogBuilder(
			{
				windowId: data.id,
				mobileWizard: this,
				map: this.map,
				cssClass: 'jsdialog' + (isAutofilter ? ' autofilter' : ''),
				callback: callback
			});

		if (isModalPopup && !isSnackbar) {
			var overlay = L.DomUtil.create('div', builder.options.cssClass + ' jsdialog-overlay ' + (data.cancellable ? 'cancellable' : ''), containerParent);
			overlay.id = data.id + '-overlay';
			if (data.cancellable)
				overlay.onclick = function () { that.close(data.id, true); };
		}

		builder.build(content, [data]);
		if (isAutofilter)
			content.firstChild.dir = document.documentElement.dir;

		// We show some dialogs such as Macro Security Warning Dialog and Text Import Dialog (csv)
		// They are displayed before the document is loaded
		// Spinning should be happening until the 1st interaction with the user
		// which is the dialog opening in this case
		this.map._progressBar.end();


		var onInput = function(ev) {
			if (ev.isFirst)
				that.draggingObject = that.dialogs[data.id];

			if (ev.isFinal && that.draggingObject
				&& that.draggingObject.translateX
				&& that.draggingObject.translateY) {
				that.draggingObject.startX = that.draggingObject.translateX;
				that.draggingObject.startY = that.draggingObject.translateY;
				that.draggingObject.translateX = 0;
				that.draggingObject.translateY = 0;
				that.draggingObject = null;
			}
		};

		if (!isModalPopup) {
			button.onclick = function() {
				that.closeDialog(data.id, true);
			};

			var hammerTitlebar = new Hammer(titlebar);
			hammerTitlebar.add(new Hammer.Pan({ threshold: 20, pointers: 0 }));

			hammerTitlebar.on('panstart', this.onPan.bind(this));
			hammerTitlebar.on('panmove', this.onPan.bind(this));
			hammerTitlebar.on('hammer.input', onInput);
		}

		var clickToCloseId = data.clickToClose;
		if (clickToCloseId && clickToCloseId.indexOf('.uno:') === 0)
			clickToCloseId = clickToCloseId.substr('.uno:'.length);

		var setupPosition = function(force) {
			if (isModalPopup && data.popupParent) {
				// in case of toolbox we want to create popup positioned by toolitem not toolbox
				var parent = L.DomUtil.get(data.popupParent);

				if (clickToCloseId && parent) {
					var childButton = parent.querySelector('[id=\'' + clickToCloseId + '\']');
					if (childButton)
						parent = childButton;
				}

				if (!parent && data.popupParent === '_POPOVER_') {
					// popup was trigerred not by toolbar or menu button, probably on tile area
					if (isAutofilter) {
						// we are already done
					} else if (isDocumentAreaPopup) {
						console.warn('other popup than autofilter in the document area');
						posX = data.posx;
						posY = data.posy;
					} else {
						// validity listbox
						parent = document.querySelector('.spreadsheet-drop-down-marker');
					}
				}

				if (parent) {
					posX = parent.getBoundingClientRect().left;
					posY = parent.getBoundingClientRect().bottom + 5;

					if (posX + content.clientWidth > window.innerWidth)
						posX -= posX + content.clientWidth + 10 - window.innerWidth;
					if (posY + content.clientHeight > window.innerHeight)
						posY -= posY + content.clientHeight + 10 - window.innerHeight;
				} else if (isDocumentAreaPopup) {
					var height = container.getBoundingClientRect().height;
					if (posY + height > containerParent.getBoundingClientRect().height) {
						var newTopPosition = posY - height;
						if (newTopPosition < 0)
							newTopPosition = 0;
						posY = newTopPosition;
					}

					var width = container.getBoundingClientRect().width;
					if (posX + width > containerParent.getBoundingClientRect().width) {
						var newLeftPosition = posX - width;
						if (newLeftPosition < 0)
							newLeftPosition = 0;
						posX = newLeftPosition;
					}
				}
			} else if (isSnackbar) {
				posX = window.innerWidth/2 - container.offsetWidth/2;
				posY = window.innerHeight - container.offsetHeight - 40;
			} else if (force || (posX === 0 && posY === 0)) {
				posX = window.innerWidth/2 - container.offsetWidth/2;
				posY = window.innerHeight/2 - container.offsetHeight/2;
			}
		};

		setupPosition();
		this.updatePosition(container, posX, posY);

		// after some updates, eg. drawing areas window can be bigger than initially
		// update possition according to that with small delay

		var that = this;
		var initialPositionSetup = function (force) {
			setupPosition(force);
			that.updatePosition(container, posX, posY);
			container.style.visibility = '';
			if (toRemove)
				L.DomUtil.remove(toRemove);
			var focusWidget = focusWidgetId ?
				container.querySelector('[id=\'' + focusWidgetId + '\']') : null;
			if (focusWidget)
				focusWidget.focus();
			if (focusWidget && document.activeElement !== focusWidget)
				console.error('cannot get focus for widget: "' + focusWidgetId + '"');
		};

		this.dialogs[data.id] = {
			container: container,
			builder: builder,
			tabs: tabs,
			startX: posX,
			startY: posY,
			clickToClose: clickToCloseId ? L.DomUtil.get(clickToCloseId) : null,
			overlay: overlay,
			isPopup: isModalPopup,
			invalidated: false,
			setupPosFunc: initialPositionSetup
		};

		setTimeout(initialPositionSetup, 200);

		if (isSnackbar) {
			setTimeout(function () { that.closePopover(data.id, false); }, this.options.snackbarTimeout);
		}
	},

	onJSUpdate: function (e) {
		var data = e.data;

		if (data.jsontype !== 'dialog')
			return;

		var dialog = this.dialogs[data.id] ? this.dialogs[data.id].container : null;
		if (!dialog)
			return;

		var control = dialog.querySelector('[id=\'' + data.control.id + '\']');
		if (!control) {
			window.app.console.warn('jsdialogupdate: not found control with id: "' + data.control.id + '"');
			return;
		}

		var parent = control.parentNode;
		if (!parent)
			return;

		var scrollTop = control.scrollTop;
		var focusedElement = document.activeElement;
		var focusedElementInDialog = focusedElement ? dialog.querySelector('[id=\'' + focusedElement.id + '\']') : null;
		var focusedId = focusedElementInDialog ? focusedElementInDialog.id : null;

		control.style.visibility = 'hidden';
		var builder = new L.control.jsDialogBuilder({windowId: data.id,
			mobileWizard: this,
			map: this.map,
			cssClass: 'jsdialog'});

		var temporaryParent = L.DomUtil.create('div');
		builder.build(temporaryParent, [data.control], false);
		parent.insertBefore(temporaryParent.firstChild, control.nextSibling);
		L.DomUtil.remove(control);

		var newControl = dialog.querySelector('[id=\'' + data.control.id + '\']');
		if (newControl)
			newControl.scrollTop = scrollTop;

		if (focusedId)
			dialog.querySelector('[id=\'' + focusedId + '\']').focus();

		var dialogInfo = this.dialogs[data.id];
		if (!dialogInfo.invalidated && dialogInfo.setupPosFunc) {
			setTimeout(function () { dialogInfo.setupPosFunc(true); }, 100);
			dialogInfo.invalidated = true;
		}
	},

	onJSAction: function (e) {
		var data = e.data;

		if (data.jsontype !== 'dialog')
			return;

		var builder = this.dialogs[data.id] ? this.dialogs[data.id].builder : null;
		if (!builder)
			return;

		var dialog = this.dialogs[data.id] ? this.dialogs[data.id].container : null;
		if (!dialog)
			return;

		builder.executeAction(dialog, data.data);
	},

	onPan: function (ev) {
		var target = this.draggingObject;
		if (target) {
			var startX = target.startX ? target.startX : 0;
			var startY = target.startY ? target.startY : 0;

			var newX = startX + ev.deltaX;
			var newY = startY + ev.deltaY;

			// Don't allow to put dialog outside the view
			if (!(newX < 0 || newY < 0
				|| newX > window.innerWidth - target.offsetWidth/2
				|| newY > window.innerHeight - target.offsetHeight/2)) {
				target.translateX = newX;
				target.translateY = newY;

				this.updatePosition(target.container, newX, newY);
			}
		}
	},

	updatePosition: function (target, newX, newY) {
		target.style.marginLeft = newX + 'px';
		target.style.marginTop = newY + 'px';
	},

	handleKeyEvent: function (event) {
		var keyCode = event.keyCode;

		switch (keyCode) {
		case 27:
			// ESC
			var dialogs = Object.keys(this.dialogs);
			if (dialogs.length) {
				var lastKey = dialogs[dialogs.length - 1];
				this.close(lastKey, true);
				this.map.focus();
				return true;
			}
		}

		return false;
	}
});

L.control.jsDialog = function (options) {
	return new L.Control.JSDialog(options);
};
