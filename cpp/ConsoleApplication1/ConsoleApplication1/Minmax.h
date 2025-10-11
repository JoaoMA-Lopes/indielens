#pragma once


int minn(int a, int b) {
	if (a >= b) {
		return b;
	}
	else {
		return a;
	}
}

int maxx(int a, int b) {
	if (a <= b) {
		return b;
	}
	else {
		return a;
	}
}